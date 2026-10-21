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
import { SLIP_PUSH, SLIP_RECOVERY } from "./rider-drive.ts";
import { LANDING_SLIP } from "./rider-flight.ts";
import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  curvePushOf,
  lateralSpeedLimit,
  TICK_SECONDS,
} from "./state.ts";
import type { BikeSpec, Hazard, RaceState, RiderState } from "./state.ts";
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
const FORECAST_SECONDS = 3.5;
const CRASH_COST = 10;
const ROCK_LANDING_SHARE = 0.85;
const LANDING_SEARCH_STEPS = 8;
export const SLIPPING = 0.2;
export const SLIPPING_STEER = 0.45;
const OIL_BEND_PUSH = 1.2;
const OIL_SCAN_STEP = 5;

const FORECAST_TICKS = Math.ceil(FORECAST_SECONDS / TICK_SECONDS) + 1;
const courseTravelled = new Float64Array(FORECAST_TICKS);
const coursePush = new Float64Array(FORECAST_TICKS);
const courseLimit = new Float64Array(FORECAST_TICKS);

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

export const inSight: number[] = [];

export const gatherInSight = (state: RaceState, rider: RiderState): void => {
  inSight.length = 0;
  const sight = sightOf(rider);
  let nearest = -1;
  for (const [index, hazard] of state.hazards.entries()) {
    const passed = hazard.s + hazard.halfLength + BIKE_HALF_LENGTH < rider.s;
    const ahead = metresToContact(rider, hazard);
    if (!passed && ahead <= sight) {
      inSight.push(index);
      const closest = state.hazards[nearest];
      if (!closest || ahead < metresToContact(rider, closest)) {
        nearest = index;
      }
    }
  }
  if (nearest >= 0 && overlooks(state, rider, nearest)) {
    inSight.splice(inSight.indexOf(nearest), 1);
  }
};

const contactReach = (hazard: Hazard): number =>
  hazard.halfWidth + BIKE_HALF_WIDTH + CONTACT_MARGIN;

const hazardCost = (hazard: Hazard, speed: number): number => {
  if (hazard.kind === "rock") {
    return ROCK_COST + ROCK_COST_PER_SPEED * (speed / ROCK_FAST) ** 2;
  }
  return hazard.kind === "oil" ? OIL_COST : POTHOLE_COST;
};

interface Obstruction {
  readonly start: number;
  readonly end: number;
  readonly ahead: number;
  readonly along: number;
  readonly speed: number;
  readonly x: number;
  readonly reach: number;
  readonly cost: number;
  readonly rock: boolean;
  readonly oil: boolean;
  readonly curvature: number;
  readonly metres: number;
  readonly traffic: boolean;
}

const obstructions: Obstruction[] = [];
const struck: boolean[] = [];

const horizons = { hazard: 0 };

export const measureHorizons = (): void => {
  horizons.hazard = 0;
  for (const obstruction of obstructions) {
    if (!obstruction.traffic) {
      horizons.hazard = Math.max(horizons.hazard, obstruction.end);
    }
  }
};

const gapTo = (
  obstruction: Obstruction,
  seconds: number,
  travelled: number
): number => obstruction.ahead + obstruction.speed * seconds - travelled;

const carsAhead = (seconds: number, travelled: number): boolean =>
  obstructions.some(
    (obstruction) =>
      obstruction.traffic &&
      gapTo(obstruction, seconds, travelled) > -obstruction.along
  );

const withinHorizon = (
  tick: number,
  travelled: number,
  speed: number,
  carAhead: boolean
): boolean =>
  tick * TICK_SECONDS <= FORECAST_SECONDS &&
  (carAhead || travelled / Math.max(1, speed) <= horizons.hazard);

export const planCourse = (track: Track, rider: RiderState): void => {
  const { bike } = rider;
  let { speed } = rider;
  let travelled = 0;
  for (
    let tick = 1;
    tick < FORECAST_TICKS &&
    withinHorizon(
      tick,
      travelled,
      rider.speed,
      carsAhead((tick - 1) * TICK_SECONDS, travelled)
    );
    tick += 1
  ) {
    speed = Math.min(speed, sampleOf(paced, plan.paced, travelled));
    travelled += speed * TICK_SECONDS;
    courseTravelled[tick] = travelled;
    coursePush[tick] = curvePushOf(
      bike,
      curvatureAt(track, rider.s + travelled),
      speed
    );
    courseLimit[tick] = lateralSpeedLimit(bike, speed);
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

export const gatherObstructions = (
  state: RaceState,
  track: Track,
  rider: RiderState
): void => {
  obstructions.length = 0;
  const pace = Math.max(1, rider.speed);
  for (const index of inSight) {
    const hazard = state.hazards[index];
    if (hazard) {
      obstructions.push({
        ahead: 0,
        along: 0,
        cost: hazardCost(hazard, rider.speed),
        curvature:
          hazard.kind === "oil"
            ? oilBendOf(track, hazard, rider.speed)
            : curvatureAt(track, hazard.s),
        end: (hazard.s + hazard.halfLength + BIKE_HALF_LENGTH - rider.s) / pace,
        metres: Math.max(0, metresToContact(rider, hazard)),
        oil: hazard.kind === "oil",
        reach: contactReach(hazard),
        rock: hazard.kind === "rock",
        speed: 0,
        start: metresToContact(rider, hazard) / pace,
        traffic: false,
        x: hazard.x,
      });
    }
  }
  for (const car of state.cars) {
    const closing = rider.speed - car.speed;
    const start =
      (car.s - car.halfLength - BIKE_HALF_LENGTH - rider.s) / closing;
    const end = (car.s + car.halfLength + BIKE_HALF_LENGTH - rider.s) / closing;
    if (closing > 0 && end >= 0 && start <= FORECAST_SECONDS) {
      obstructions.push({
        ahead: car.s - rider.s,
        along: car.halfLength + BIKE_HALF_LENGTH,
        cost: CRASH_COST,
        curvature: 0,
        end,
        metres: 0,
        oil: false,
        reach: car.halfWidth + BIKE_HALF_WIDTH,
        rock: false,
        speed: car.speed,
        start,
        traffic: true,
        x: car.x,
      });
    }
  }
};

export const toll = {
  cost: 0,
  rock: false,
  slickMetres: Number.POSITIVE_INFINITY,
  slickSpeed: Number.POSITIVE_INFINITY,
  speed: Number.POSITIVE_INFINITY,
  speedMetres: Number.POSITIVE_INFINITY,
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
    rider.speed ** 2 - landing ** 2 >
    2 * PLANNED_BRAKING * obstruction.metres
  ) {
    toll.cost += CRASH_COST;
  }
  toll.speed = Math.min(toll.speed, landing);
  toll.speedMetres = Math.min(toll.speedMetres, obstruction.metres);
};

const crossOil = (rider: RiderState, obstruction: Obstruction): void => {
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

const touched = { carAhead: false, oil: false };

const tally = (
  rider: RiderState,
  x: number,
  seconds: number,
  travelled: number,
  lateralSpeed: number,
  braking: boolean
): void => {
  const reached = travelled / Math.max(1, rider.speed);
  touched.oil = false;
  touched.carAhead = false;
  for (let index = 0; index < obstructions.length; index += 1) {
    const obstruction = obstructions[index];
    if (!obstruction || struck[index] === true) {
      continue;
    }
    let meets = reached >= obstruction.start && reached <= obstruction.end;
    if (obstruction.traffic) {
      const gap = gapTo(obstruction, seconds, travelled);
      touched.carAhead ||= gap > -obstruction.along;
      meets = !braking && Math.abs(gap) <= obstruction.along;
    }
    if (meets && Math.abs(x - obstruction.x) < obstruction.reach) {
      struck[index] = true;
      toll.cost += obstruction.cost;
      if (obstruction.rock) {
        toll.rock = true;
        landOnRock(rider, obstruction, lateralSpeed);
      }
      if (obstruction.oil) {
        touched.oil = true;
        crossOil(rider, obstruction);
      }
    }
  }
};

const forecast = (
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
  struck.length = 0;
  tally(
    rider,
    x,
    0,
    0,
    lateralSpeed - curvePushOf(bike, curvatureAt(track, rider.s), speed),
    braking
  );
  if (touched.oil) {
    slip = OIL_SLIP;
  }
  for (
    let tick = 1;
    withinHorizon(tick, travelled, rider.speed, touched.carAhead);
    tick += 1
  ) {
    let bendPush = coursePush[tick] ?? 0;
    let grip = courseLimit[tick] ?? 0;
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
      travelled = courseTravelled[tick] ?? travelled;
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
      rider,
      x,
      tick * TICK_SECONDS,
      travelled,
      lateralSpeed - push,
      braking
    );
    if (touched.oil) {
      slip = OIL_SLIP;
    }
  }
};

export const weigh = (
  track: Track,
  rider: RiderState,
  line: number,
  braking: boolean
): void => {
  toll.cost = 0;
  toll.rock = false;
  toll.slickMetres = Number.POSITIVE_INFINITY;
  toll.slickSpeed = Number.POSITIVE_INFINITY;
  toll.speed = Number.POSITIVE_INFINITY;
  toll.speedMetres = Number.POSITIVE_INFINITY;
  forecast(
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
    forecast(track, rider, line, braking, slowTo, slowAt);
  }
};
