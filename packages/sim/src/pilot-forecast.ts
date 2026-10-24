import { nextSeed, unitOf } from "@racer/track/random";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { OIL_SLIP, rockUpsetShare } from "./hazards.ts";
import {
  deceleration,
  LANE_CHANGE_RATE,
  MAX_LATERAL_SPEED,
  neededToSlow,
  OIL_RECOVERY_SECONDS,
  paced,
  plan,
  PLANNED_BRAKING,
  riding,
  sampleOf,
} from "./pilot-corners.ts";
import { FORECAST_SECONDS, FORECAST_TICKS } from "./pilot-history.ts";
import { SLIP_PUSH, SLIP_RECOVERY } from "./rider-drive.ts";
import { LANDING_SLIP } from "./rider-flight.ts";
import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  curvePushOf,
  lateralSpeedLimit,
  slotOf,
  TICK_SECONDS,
} from "./state.ts";
import type {
  BikeSpec,
  Hazard,
  PilotHistory,
  RaceState,
  RiderState,
} from "./state.ts";
import { weapons } from "./weapons.ts";

const HAZARD_SIGHT_SECONDS = 2.35;
const HAZARD_SIGHT_EXTRA = 15;
const DODGE_MARGIN = 0.45;
const HAZARD_MISS_SHARE = 0.4;
export const ROCK_THROUGH_SPEED = 150 / 3.6;
const POTHOLE_COST = 0.6;
const OIL_COST = 1;
const ROCK_COST = 2;
const ROCK_COST_PER_SPEED = 2;
const ROCK_FAST = 55.6;
const CONTACT_MARGIN = 0.1;
const CRASH_COST = 10;
const ROCK_LANDING_SHARE = 0.85;
const LANDING_SEARCH_STEPS = 8;
export const SLIPPING = 0.2;
export const SLIPPING_STEER = 0.45;
const OIL_BEND_PUSH = 1.2;
const OIL_SCAN_STEP = 5;

const hazardRoll = (state: RaceState): number => {
  state.hazardDice = nextSeed(state.hazardDice);
  return unitOf(state.hazardDice);
};

const overlooks = (
  state: RaceState,
  rider: RiderState,
  hazardIndex: number
): boolean => {
  if (rider.hazardSeen !== hazardIndex) {
    rider.hazardSeen = hazardIndex;
    rider.hazardMissed =
      hazardRoll(state) < (1 - rider.profile.skill) * HAZARD_MISS_SHARE;
  }
  return rider.hazardMissed;
};

export const dodgeReach = (hazard: Hazard): number =>
  hazard.halfWidth + BIKE_HALF_WIDTH + DODGE_MARGIN;

const metresToContact = (rider: RiderState, hazard: Hazard): number =>
  hazard.s - hazard.halfLength - BIKE_HALF_LENGTH - rider.s;

export const sightOf = (rider: RiderState): number =>
  rider.speed * HAZARD_SIGHT_SECONDS + HAZARD_SIGHT_EXTRA;

interface Obstruction {
  start: number;
  end: number;
  ahead: number;
  along: number;
  speed: number;
  x: number;
  reach: number;
  cost: number;
  rock: boolean;
  oil: boolean;
  curvature: number;
  metres: number;
  traffic: boolean;
  struck: boolean;
}

export interface Toll {
  cost: number;
  rock: boolean;
  slickMetres: number;
  slickSpeed: number;
  speed: number;
  speedMetres: number;
}

export interface Outlook {
  readonly inSight: number[];
  sighted: number;
  readonly obstructions: Obstruction[];
  obstructed: number;
  hazardHorizon: number;
  touchedOil: boolean;
  carAhead: boolean;
  readonly toll: Toll;
}

export const createOutlook = (): Outlook => ({
  carAhead: false,
  hazardHorizon: 0,
  inSight: [],
  obstructed: 0,
  obstructions: [],
  sighted: 0,
  toll: {
    cost: 0,
    rock: false,
    slickMetres: Number.POSITIVE_INFINITY,
    slickSpeed: Number.POSITIVE_INFINITY,
    speed: Number.POSITIVE_INFINITY,
    speedMetres: Number.POSITIVE_INFINITY,
  },
  touchedOil: false,
});

const createObstruction = (): Obstruction => ({
  ahead: 0,
  along: 0,
  cost: 0,
  curvature: 0,
  end: 0,
  metres: 0,
  oil: false,
  reach: 0,
  rock: false,
  speed: 0,
  start: 0,
  struck: false,
  traffic: false,
  x: 0,
});

const overlook = (outlook: Outlook, hazardIndex: number): void => {
  const { inSight } = outlook;
  let kept = 0;
  for (let place = 0; place < outlook.sighted; place += 1) {
    const index = inSight[place] ?? -1;
    if (index !== hazardIndex) {
      inSight[kept] = index;
      kept += 1;
    }
  }
  outlook.sighted = kept;
};

export const gatherInSight = (
  outlook: Outlook,
  state: RaceState,
  rider: RiderState
): void => {
  const { inSight } = outlook;
  outlook.sighted = 0;
  const sight = sightOf(rider);
  let nearest = -1;
  for (let index = 0; index < state.hazards.length; index += 1) {
    const hazard = state.hazards[index];
    if (!hazard) {
      continue;
    }
    const passed = hazard.s + hazard.halfLength + BIKE_HALF_LENGTH < rider.s;
    const ahead = metresToContact(rider, hazard);
    if (!passed && ahead <= sight) {
      inSight[outlook.sighted] = index;
      outlook.sighted += 1;
      const closest = state.hazards[nearest];
      if (!closest || ahead < metresToContact(rider, closest)) {
        nearest = index;
      }
    }
  }
  if (nearest >= 0 && overlooks(state, rider, nearest)) {
    overlook(outlook, nearest);
  }
};

const contactReach = (hazard: Hazard): number =>
  hazard.halfWidth + BIKE_HALF_WIDTH + CONTACT_MARGIN;

const hazardCost = (hazard: Hazard, speed: number): number => {
  if (hazard.kind === "rock") {
    const ratio = speed / ROCK_FAST;
    return ROCK_COST + ROCK_COST_PER_SPEED * (ratio * ratio);
  }
  return hazard.kind === "oil" ? OIL_COST : POTHOLE_COST;
};

export const measureHorizons = (outlook: Outlook): void => {
  const { obstructions } = outlook;
  outlook.hazardHorizon = 0;
  for (let index = 0; index < outlook.obstructed; index += 1) {
    const obstruction = obstructions[index];
    if (obstruction && !obstruction.traffic) {
      outlook.hazardHorizon = Math.max(outlook.hazardHorizon, obstruction.end);
    }
  }
};

const gapTo = (
  obstruction: Obstruction,
  seconds: number,
  travelled: number
): number => obstruction.ahead + obstruction.speed * seconds - travelled;

const carsAhead = (
  outlook: Outlook,
  seconds: number,
  travelled: number
): boolean => {
  const { obstructions } = outlook;
  for (let index = 0; index < outlook.obstructed; index += 1) {
    const obstruction = obstructions[index];
    if (
      obstruction?.traffic === true &&
      gapTo(obstruction, seconds, travelled) > -obstruction.along
    ) {
      return true;
    }
  }
  return false;
};

const withinHorizon = (
  outlook: Outlook,
  tick: number,
  travelled: number,
  speed: number,
  carAhead: boolean
): boolean =>
  tick * TICK_SECONDS <= FORECAST_SECONDS &&
  (carAhead || travelled / Math.max(1, speed) <= outlook.hazardHorizon);

export const planCourse = (
  history: PilotHistory,
  outlook: Outlook,
  track: Track,
  rider: RiderState
): void => {
  const { bike } = rider;
  let { speed } = rider;
  let travelled = 0;
  for (
    let tick = 1;
    tick < FORECAST_TICKS &&
    withinHorizon(
      outlook,
      tick,
      travelled,
      rider.speed,
      carsAhead(outlook, (tick - 1) * TICK_SECONDS, travelled)
    );
    tick += 1
  ) {
    speed = Math.min(speed, sampleOf(paced, plan.paced, travelled));
    travelled += speed * TICK_SECONDS;
    history.courseTravelled[tick] = travelled;
    history.coursePush[tick] = curvePushOf(
      bike,
      curvatureAt(track, rider.s + travelled),
      speed
    );
    history.courseLimit[tick] = lateralSpeedLimit(bike, speed);
  }
};

const oilBendOf = (track: Track, hazard: Hazard, speed: number): number => {
  const end = hazard.s + hazard.halfLength + speed * OIL_RECOVERY_SECONDS;
  let bend = 0;
  for (let s = hazard.s - hazard.halfLength; s <= end; s += OIL_SCAN_STEP) {
    bend = Math.max(bend, Math.abs(curvatureAt(track, s)));
  }
  return bend;
};

const nextObstruction = (outlook: Outlook): Obstruction => {
  const obstruction = slotOf(
    outlook.obstructions,
    outlook.obstructed,
    createObstruction
  );
  outlook.obstructed += 1;
  return obstruction;
};

export const gatherObstructions = (
  outlook: Outlook,
  state: RaceState,
  track: Track,
  rider: RiderState
): void => {
  const { inSight } = outlook;
  outlook.obstructed = 0;
  const pace = Math.max(1, rider.speed);
  for (let place = 0; place < outlook.sighted; place += 1) {
    const hazard = state.hazards[inSight[place] ?? -1];
    if (hazard) {
      const obstruction = nextObstruction(outlook);
      obstruction.ahead = 0;
      obstruction.along = 0;
      obstruction.cost = hazardCost(hazard, rider.speed);
      obstruction.curvature =
        hazard.kind === "oil"
          ? oilBendOf(track, hazard, rider.speed)
          : curvatureAt(track, hazard.s);
      obstruction.end =
        (hazard.s + hazard.halfLength + BIKE_HALF_LENGTH - rider.s) / pace;
      obstruction.metres = Math.max(0, metresToContact(rider, hazard));
      obstruction.oil = hazard.kind === "oil";
      obstruction.reach = contactReach(hazard);
      obstruction.rock = hazard.kind === "rock";
      obstruction.speed = 0;
      obstruction.start = metresToContact(rider, hazard) / pace;
      obstruction.traffic = false;
      obstruction.x = hazard.x;
    }
  }
  for (const car of state.cars) {
    const closing = rider.speed - car.speed;
    const start =
      (car.s - car.halfLength - BIKE_HALF_LENGTH - rider.s) / closing;
    const end = (car.s + car.halfLength + BIKE_HALF_LENGTH - rider.s) / closing;
    if (closing > 0 && end >= 0 && start <= FORECAST_SECONDS) {
      const obstruction = nextObstruction(outlook);
      obstruction.ahead = car.s - rider.s;
      obstruction.along = car.halfLength + BIKE_HALF_LENGTH;
      obstruction.cost = CRASH_COST;
      obstruction.curvature = 0;
      obstruction.end = end;
      obstruction.metres = 0;
      obstruction.oil = false;
      obstruction.reach = car.halfWidth + BIKE_HALF_WIDTH;
      obstruction.rock = false;
      obstruction.speed = car.speed;
      obstruction.start = start;
      obstruction.traffic = true;
      obstruction.x = car.x;
    }
  }
};

const throwsOnRock = (
  bike: BikeSpec,
  lateralSpeed: number,
  curvature: number,
  speed: number
): boolean =>
  Math.abs(lateralSpeed + curvePushOf(bike, curvature, speed)) /
    Math.max(1, lateralSpeedLimit(bike, speed)) +
    rockUpsetShare(speed) >
  LANDING_SLIP * ROCK_LANDING_SHARE;

const rockLandingSpeed = (
  bike: BikeSpec,
  lateralSpeed: number,
  curvature: number,
  speed: number
): number => {
  if (!throwsOnRock(bike, lateralSpeed, curvature, speed)) {
    return speed;
  }
  let low = 0;
  let high = speed;
  for (let step = 0; step < LANDING_SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (throwsOnRock(bike, lateralSpeed, curvature, middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return low;
};

const landOnRock = (
  toll: Toll,
  rider: RiderState,
  obstruction: Obstruction,
  lateralSpeed: number
): void => {
  const landing = rockLandingSpeed(
    rider.bike,
    lateralSpeed,
    obstruction.curvature,
    rider.speed
  );
  if (
    rider.speed * rider.speed - landing * landing >
    2 * PLANNED_BRAKING * obstruction.metres
  ) {
    toll.cost += CRASH_COST;
  }
  toll.speed = Math.min(toll.speed, landing);
  toll.speedMetres = Math.min(toll.speedMetres, obstruction.metres);
};

const crossOil = (
  toll: Toll,
  rider: RiderState,
  obstruction: Obstruction
): void => {
  if (obstruction.curvature <= 0) {
    return;
  }
  const settled = Math.sqrt(
    (OIL_BEND_PUSH * rider.bike.curvePush) / obstruction.curvature
  );
  const need = neededToSlow(rider.speed, settled, obstruction.metres);
  if (need > deceleration.capacity) {
    toll.cost += CRASH_COST;
  }
  if (
    !Number.isFinite(toll.slickSpeed) ||
    need > neededToSlow(rider.speed, toll.slickSpeed, toll.slickMetres)
  ) {
    toll.slickMetres = obstruction.metres;
    toll.slickSpeed = settled;
  }
};

const tally = (
  outlook: Outlook,
  rider: RiderState,
  x: number,
  seconds: number,
  travelled: number,
  lateralSpeed: number,
  braking: boolean
): void => {
  const { obstructions, toll } = outlook;
  const reached = travelled / Math.max(1, rider.speed);
  outlook.touchedOil = false;
  outlook.carAhead = false;
  for (let index = 0; index < outlook.obstructed; index += 1) {
    const obstruction = obstructions[index];
    if (!obstruction || obstruction.struck) {
      continue;
    }
    let meets = reached >= obstruction.start && reached <= obstruction.end;
    if (obstruction.traffic) {
      const gap = gapTo(obstruction, seconds, travelled);
      outlook.carAhead ||= gap > -obstruction.along;
      meets = !braking && Math.abs(gap) <= obstruction.along;
    }
    if (meets && Math.abs(x - obstruction.x) < obstruction.reach) {
      obstruction.struck = true;
      toll.cost += obstruction.cost;
      if (obstruction.rock) {
        toll.rock = true;
        landOnRock(toll, rider, obstruction, lateralSpeed);
      }
      if (obstruction.oil) {
        outlook.touchedOil = true;
        crossOil(toll, rider, obstruction);
      }
    }
  }
};

const forecast = (
  history: PilotHistory,
  outlook: Outlook,
  track: Track,
  rider: RiderState,
  line: number,
  braking: boolean,
  slowTo: number,
  slowAt: number
): void => {
  const { bike } = rider;
  const steerRate = bike.steerRate * weapons[rider.weapon].steerFactor;
  const slowingRate = riding.brakeShare * deceleration.capacity;
  const slowsDown = Number.isFinite(slowTo);
  let { lateralSpeed, slip, speed, x } = rider;
  let travelled = 0;
  for (let index = 0; index < outlook.obstructed; index += 1) {
    const obstruction = outlook.obstructions[index];
    if (obstruction) {
      obstruction.struck = false;
    }
  }
  tally(
    outlook,
    rider,
    x,
    0,
    0,
    lateralSpeed - curvePushOf(bike, curvatureAt(track, rider.s), speed),
    braking
  );
  if (outlook.touchedOil) {
    slip = OIL_SLIP;
  }
  for (
    let tick = 1;
    withinHorizon(outlook, tick, travelled, rider.speed, outlook.carAhead);
    tick += 1
  ) {
    let bendPush = history.coursePush[tick] ?? 0;
    let grip = history.courseLimit[tick] ?? 0;
    if (slowsDown) {
      speed = Math.min(
        speed,
        sampleOf(paced, plan.paced, travelled),
        Math.sqrt(
          slowTo * slowTo + 2 * slowingRate * Math.max(0, slowAt - travelled)
        )
      );
      travelled += speed * TICK_SECONDS;
      bendPush = curvePushOf(
        bike,
        curvatureAt(track, rider.s + travelled),
        speed
      );
      grip = lateralSpeedLimit(bike, speed);
    } else {
      travelled = history.courseTravelled[tick] ?? travelled;
    }
    const push = bendPush * (1 + SLIP_PUSH * slip);
    const limit = grip * (slip > SLIPPING ? SLIPPING_STEER : 1);
    const drift = lateralSpeed - push;
    const settling = (drift * Math.abs(drift)) / (2 * bike.steerRate);
    const wanted = clamp(
      clamp(
        (line - x - settling) * LANE_CHANGE_RATE,
        -MAX_LATERAL_SPEED,
        MAX_LATERAL_SPEED
      ) + push,
      -limit,
      limit
    );
    const turn = steerRate * (1 - slip) * TICK_SECONDS;
    lateralSpeed += clamp(wanted - lateralSpeed, -turn, turn);
    x += (lateralSpeed - push) * TICK_SECONDS;
    slip = Math.max(0, slip - SLIP_RECOVERY * TICK_SECONDS);
    tally(
      outlook,
      rider,
      x,
      tick * TICK_SECONDS,
      travelled,
      lateralSpeed - push,
      braking
    );
    if (outlook.touchedOil) {
      slip = OIL_SLIP;
    }
  }
};

export const weigh = (
  history: PilotHistory,
  outlook: Outlook,
  track: Track,
  rider: RiderState,
  line: number,
  braking: boolean
): void => {
  const { toll } = outlook;
  toll.cost = 0;
  toll.rock = false;
  toll.slickMetres = Number.POSITIVE_INFINITY;
  toll.slickSpeed = Number.POSITIVE_INFINITY;
  toll.speed = Number.POSITIVE_INFINITY;
  toll.speedMetres = Number.POSITIVE_INFINITY;
  forecast(
    history,
    outlook,
    track,
    rider,
    line,
    braking,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  );
  const rockSpeed = toll.rock ? ROCK_THROUGH_SPEED : Number.POSITIVE_INFINITY;
  const slowTo = Math.min(toll.speed, rockSpeed, toll.slickSpeed);
  if (slowTo < rider.speed) {
    const slowAt =
      slowTo === toll.slickSpeed ? toll.slickMetres : toll.speedMetres;
    toll.cost = 0;
    forecast(history, outlook, track, rider, line, braking, slowTo, slowAt);
  }
};
