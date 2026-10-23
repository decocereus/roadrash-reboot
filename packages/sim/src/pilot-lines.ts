import { nextJumpFrom } from "@racer/track/features";
import type { Track } from "@racer/track/track";

import {
  JUMP_WALL_CLEARANCE,
  measureDeceleration,
  planForecast,
  PLANNED_BRAKING,
} from "./pilot-corners.ts";
import type { Slick } from "./pilot-corners.ts";
import {
  createOutlook,
  dodgeReach,
  gatherInSight,
  gatherObstructions,
  measureHorizons,
  planCourse,
  ROCK_THROUGH_SPEED,
  sightOf,
  weigh,
} from "./pilot-forecast.ts";
import type { Outlook, Toll } from "./pilot-forecast.ts";
import type { PilotHistory } from "./pilot-history.ts";
import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  raceOwned,
  slotOf,
} from "./state.ts";
import type { RaceState, RiderState, TrafficCar } from "./state.ts";

const FOLLOW_SECONDS = 2.4;
const ONCOMING_SECONDS = 4.5;
const ONCOMING_ENTRY_SECONDS = 8;
const START_TICKS = 600;
const START_ONCOMING_ENTRY_SECONDS = 12;
const CENTRE_SEAM_BIAS = 0.6;
const LANE_REACH = 1.7;
const SPLITTING_SPEED = 8;
const RIDER_FOLLOW_SECONDS = 1.2;
const CROSSING_SECONDS = 1.5;
const OWN_LANE_REACH = 1;
const DODGE_EDGE = 0.2;
const MOVE_COST = 0.05;
const LANE_RANK_COST = 1;
const OFF_LANE_COST = 0.2;
const PURSUIT_COST = -1;
const HYSTERESIS = 0.15;
const LINE_MATCH = 0.05;
const PASS_MARGIN = 0.3;
const FOLLOW_COST = 5;

export const slickAhead: Slick = {
  metres: Number.POSITIVE_INFINITY,
  speed: Number.POSITIVE_INFINITY,
};

interface Threat {
  seconds: number;
  speed: number;
}

const secondsUntilContact = (
  rider: RiderState,
  s: number,
  speed: number,
  halfLength: number
): number => {
  const gap = s - rider.s - halfLength - 1;
  const closingSpeed = rider.speed - speed;
  if (gap < -2 * halfLength - 2) {
    return Number.POSITIVE_INFINITY;
  }
  if (gap <= 0) {
    return 0;
  }
  return closingSpeed > 0 ? gap / closingSpeed : Number.POSITIVE_INFINITY;
};

const oncomingHorizon = (
  state: RaceState,
  rider: RiderState,
  laneX: number
): number => {
  if (Math.abs(laneX - rider.x) < OWN_LANE_REACH) {
    return ONCOMING_SECONDS;
  }
  return state.tick < START_TICKS
    ? START_ONCOMING_ENTRY_SECONDS
    : ONCOMING_ENTRY_SECONDS;
};

export const carThreat = (
  state: RaceState,
  rider: RiderState,
  laneX: number,
  within: number
): Threat | undefined => {
  let seconds = Number.POSITIVE_INFINITY;
  let speed = 0;
  for (const car of state.cars) {
    const oncoming = car.cruiseSpeed < 0;
    if (
      (oncoming || car.s - rider.s < within) &&
      Math.abs(car.x - laneX) < LANE_REACH &&
      rider.speed > car.speed
    ) {
      const horizon = oncoming
        ? oncomingHorizon(state, rider, laneX)
        : FOLLOW_SECONDS;
      const contact = secondsUntilContact(
        rider,
        car.s,
        car.speed,
        car.halfLength
      );
      if (contact < horizon && contact < seconds) {
        seconds = contact;
        ({ speed } = car);
      }
    }
  }
  return seconds < Number.POSITIVE_INFINITY ? { seconds, speed } : undefined;
};

const LONGEST_CAR_HORIZON = Math.max(
  FOLLOW_SECONDS,
  ONCOMING_SECONDS,
  ONCOMING_ENTRY_SECONDS,
  START_ONCOMING_ENTRY_SECONDS
);

interface Sighting extends Threat {
  x: number;
}

interface CarSighting extends Sighting {
  oncoming: boolean;
}

export interface Aim {
  readonly speed: number;
  readonly x: number;
}

interface Weighed extends Toll {
  x: number;
  braking: boolean;
}

interface LinePlan {
  readonly outlook: Outlook;
  readonly cars: CarSighting[];
  carCount: number;
  readonly riders: Sighting[];
  riderCount: number;
  readonly lanes: number[];
  readonly threats: Threat[];
  readonly found: Threat;
  readonly offLane: number[];
  offLaneCount: number;
  readonly weighed: Weighed[];
  weighedCount: number;
  weighing: boolean;
  readonly choice: {
    cost: number;
    slickMetres: number;
    slickSpeed: number;
    speed: number;
    x: number;
  };
  readonly aim: { speed: number; x: number };
}

const createThreat = (): Threat => ({
  seconds: Number.POSITIVE_INFINITY,
  speed: 0,
});

const createCarSighting = (): CarSighting => ({
  oncoming: false,
  seconds: 0,
  speed: 0,
  x: 0,
});

const createSighting = (): Sighting => ({ seconds: 0, speed: 0, x: 0 });

const createWeighed = (): Weighed => ({
  braking: false,
  cost: 0,
  rock: false,
  slickMetres: Number.POSITIVE_INFINITY,
  slickSpeed: Number.POSITIVE_INFINITY,
  speed: Number.POSITIVE_INFINITY,
  speedMetres: Number.POSITIVE_INFINITY,
  x: 0,
});

const linePlanOf = raceOwned((): LinePlan => ({
  aim: { speed: 0, x: 0 },
  carCount: 0,
  cars: [],
  choice: {
    cost: Number.POSITIVE_INFINITY,
    slickMetres: Number.POSITIVE_INFINITY,
    slickSpeed: Number.POSITIVE_INFINITY,
    speed: 0,
    x: 0,
  },
  found: createThreat(),
  lanes: [],
  offLane: [],
  offLaneCount: 0,
  outlook: createOutlook(),
  riderCount: 0,
  riders: [],
  threats: [],
  weighed: [],
  weighedCount: 0,
  weighing: false,
}));

const gatherInReach = (
  plan: LinePlan,
  state: RaceState,
  riderIndex: number,
  rider: RiderState
): void => {
  plan.carCount = 0;
  for (const car of state.cars) {
    if (rider.speed > car.speed) {
      const seconds = secondsUntilContact(
        rider,
        car.s,
        car.speed,
        car.halfLength
      );
      if (seconds < LONGEST_CAR_HORIZON) {
        const sighting = slotOf(plan.cars, plan.carCount, createCarSighting);
        plan.carCount += 1;
        sighting.oncoming = car.cruiseSpeed < 0;
        sighting.seconds = seconds;
        sighting.speed = car.speed;
        sighting.x = car.x;
      }
    }
  }
  plan.riderCount = 0;
  for (let index = 0; index < state.riders.length; index += 1) {
    const other = state.riders[index];
    if (other && index !== riderIndex && other.mode !== "wrecked") {
      const riding = other.mode === "riding";
      const speed = riding ? other.speed : 0;
      const seconds = secondsUntilContact(
        rider,
        riding ? other.s : other.bodyS,
        speed,
        BIKE_HALF_LENGTH
      );
      if (seconds < RIDER_FOLLOW_SECONDS) {
        const sighting = slotOf(plan.riders, plan.riderCount, createSighting);
        plan.riderCount += 1;
        sighting.seconds = seconds;
        sighting.speed = speed;
        sighting.x = riding ? other.x : other.bodyX;
      }
    }
  }
};

const laneThreat = (
  plan: LinePlan,
  state: RaceState,
  rider: RiderState,
  laneX: number,
  threat: Threat
): void => {
  threat.seconds = Number.POSITIVE_INFINITY;
  threat.speed = 0;
  for (let index = 0; index < plan.carCount; index += 1) {
    const car = plan.cars[index];
    if (car && Math.abs(car.x - laneX) < LANE_REACH) {
      const horizon = car.oncoming
        ? oncomingHorizon(state, rider, laneX)
        : FOLLOW_SECONDS;
      if (car.seconds < horizon && car.seconds < threat.seconds) {
        threat.seconds = car.seconds;
        threat.speed = car.speed;
      }
    }
  }
  for (let index = 0; index < plan.riderCount; index += 1) {
    const sighting = plan.riders[index];
    if (
      sighting &&
      Math.abs(sighting.x - laneX) < LANE_REACH &&
      sighting.seconds < threat.seconds
    ) {
      threat.seconds = sighting.seconds;
      threat.speed = sighting.speed;
    }
  }
};

const threatened = (threat: Threat | undefined): threat is Threat =>
  threat !== undefined && threat.seconds < Number.POSITIVE_INFINITY;

const fillLanes = (plan: LinePlan, track: Track): void => {
  const { lanes } = plan;
  const { oncomingLanes, sameWayLanes } = track;
  for (let index = 0; index < sameWayLanes.length; index += 1) {
    lanes[index] = sameWayLanes[index] ?? 0;
  }
  for (let index = 0; index < oncomingLanes.length; index += 1) {
    lanes[sameWayLanes.length + index] = oncomingLanes[index] ?? 0;
  }
  lanes.length = sameWayLanes.length + oncomingLanes.length;
};

const gatherLaneThreats = (
  plan: LinePlan,
  state: RaceState,
  rider: RiderState
): void => {
  const { lanes, threats } = plan;
  for (let index = 0; index < lanes.length; index += 1) {
    laneThreat(
      plan,
      state,
      rider,
      lanes[index] ?? 0,
      slotOf(threats, index, createThreat)
    );
  }
};

const nearestLaneIndex = (lanes: readonly number[], x: number): number => {
  let nearest = 0;
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    if (
      lane !== undefined &&
      Math.abs(lane - x) < Math.abs((lanes[nearest] ?? 0) - x)
    ) {
      nearest = index;
    }
  }
  return nearest;
};

const neighbourOf = (
  lanes: readonly number[],
  sameWayCount: number,
  current: number
): number => {
  const here = lanes[current] ?? 0;
  let neighbour = current;
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    if (index === current || lane === undefined) {
      continue;
    }
    const apart = Math.abs(lane - here);
    const nearestSoFar = Math.abs((lanes[neighbour] ?? here) - here);
    if (
      neighbour === current ||
      apart < nearestSoFar ||
      (apart === nearestSoFar && index < sameWayCount)
    ) {
      neighbour = index;
    }
  }
  return neighbour;
};

export const between = (x: number, target: number, lane: number): boolean =>
  (lane - x) * (lane - target) < 0;

const seamOf = (
  lanes: readonly number[],
  sameWayCount: number,
  current: number,
  neighbour: number
): number => {
  const middle = ((lanes[current] ?? 0) + (lanes[neighbour] ?? 0)) / 2;
  const straddlesCentre = current < sameWayCount !== neighbour < sameWayCount;
  return straddlesCentre ? middle + CENTRE_SEAM_BIAS : middle;
};

const straddlesRamp = (track: Track, rider: RiderState, x: number): boolean => {
  const jump = track.features[nextJumpFrom(track, rider.s)];
  if (!jump || jump.s - rider.s > sightOf(rider)) {
    return false;
  }
  const across = Math.abs(x - jump.x);
  return (
    across > jump.width / 2 - BIKE_HALF_WIDTH &&
    across < jump.width / 2 + JUMP_WALL_CLEARANCE
  );
};

const passable = (rider: RiderState, car: TrafficCar): boolean =>
  car.cruiseSpeed >= 0 &&
  car.s > rider.s &&
  car.s - rider.s <= sightOf(rider) &&
  rider.speed > car.speed;

const offLaneLines = (
  plan: LinePlan,
  state: RaceState,
  rider: RiderState
): void => {
  const { offLane, outlook } = plan;
  let count = 0;
  for (let place = 0; place < outlook.sighted; place += 1) {
    const hazard = state.hazards[outlook.inSight[place] ?? -1];
    if (hazard) {
      const side = Math.sign(rider.x - hazard.x) || 1;
      offLane[count] = hazard.x + side * dodgeReach(hazard);
      offLane[count + 1] = hazard.x - side * dodgeReach(hazard);
      count += 2;
    }
  }
  for (const car of state.cars) {
    if (passable(rider, car)) {
      const pass = car.halfWidth + BIKE_HALF_WIDTH + PASS_MARGIN;
      offLane[count] = car.x + pass;
      offLane[count + 1] = car.x - pass;
      count += 2;
    }
  }
  if (Number.isFinite(rider.pilotLine)) {
    offLane[count] = rider.pilotLine;
    count += 1;
  }
  plan.offLaneCount = count;
};

const crossesBlocked = (
  plan: LinePlan,
  rider: RiderState,
  target: number
): boolean => {
  const { lanes, threats } = plan;
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index] ?? 0;
    if (
      between(rider.x, target, lane) &&
      Math.abs(lane - rider.x) >= OWN_LANE_REACH &&
      (threats[index]?.seconds ?? Number.POSITIVE_INFINITY) < CROSSING_SECONDS
    ) {
      return true;
    }
  }
  return false;
};

const weighOnce = (
  plan: LinePlan,
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  x: number,
  braking: boolean
): void => {
  const { outlook, weighed } = plan;
  const { toll } = outlook;
  for (let index = 0; index < plan.weighedCount; index += 1) {
    const known = weighed[index];
    if (known && Object.is(known.x, x) && known.braking === braking) {
      toll.cost = known.cost;
      toll.rock = known.rock;
      toll.slickMetres = known.slickMetres;
      toll.slickSpeed = known.slickSpeed;
      toll.speed = known.speed;
      toll.speedMetres = known.speedMetres;
      return;
    }
  }
  weigh(history, outlook, track, rider, x, braking);
  const line = slotOf(weighed, plan.weighedCount, createWeighed);
  plan.weighedCount += 1;
  line.braking = braking;
  line.cost = toll.cost;
  line.rock = toll.rock;
  line.slickMetres = toll.slickMetres;
  line.slickSpeed = toll.slickSpeed;
  line.speed = toll.speed;
  line.speedMetres = toll.speedMetres;
  line.x = x;
};

const offer = (
  plan: LinePlan,
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  x: number,
  speed: number,
  cost: number,
  braking: boolean
): void => {
  const { choice, outlook } = plan;
  const { toll } = outlook;
  let total = cost + MOVE_COST * Math.abs(x - rider.x);
  let lineSpeed = speed;
  toll.slickMetres = Number.POSITIVE_INFINITY;
  toll.slickSpeed = Number.POSITIVE_INFINITY;
  if (plan.weighing) {
    weighOnce(plan, history, track, rider, x, braking);
    total += toll.cost;
    lineSpeed = Math.min(
      speed,
      toll.speed,
      toll.rock ? ROCK_THROUGH_SPEED : Number.POSITIVE_INFINITY
    );
    if (Math.abs(x - rider.pilotLine) < LINE_MATCH) {
      total -= HYSTERESIS;
    }
  }
  if (total < choice.cost) {
    choice.cost = total;
    choice.slickMetres = toll.slickMetres;
    choice.slickSpeed = toll.slickSpeed;
    choice.speed = lineSpeed;
    choice.x = x;
  }
};

const offerFollow = (
  plan: LinePlan,
  history: PilotHistory,
  track: Track,
  rider: RiderState
): void => {
  const { lanes } = plan;
  const current = nearestLaneIndex(lanes, rider.x);
  const ahead = plan.threats[current];
  const lane = lanes[current];
  if (
    threatened(ahead) &&
    lane !== undefined &&
    !(ahead.seconds * 2 * PLANNED_BRAKING < rider.speed - ahead.speed)
  ) {
    offer(
      plan,
      history,
      track,
      rider,
      lane,
      Math.max(0, ahead.speed),
      LANE_RANK_COST * current + FOLLOW_COST,
      true
    );
  }
};

const offerBetweenLanes = (
  plan: LinePlan,
  history: PilotHistory,
  state: RaceState,
  track: Track,
  rider: RiderState,
  x: number,
  cruise: number
): void => {
  if (
    Math.abs(x) <= track.roadHalfWidth - BIKE_HALF_WIDTH - DODGE_EDGE &&
    !straddlesRamp(track, rider, x)
  ) {
    laneThreat(plan, state, rider, x, plan.found);
    if (!threatened(plan.found) && !crossesBlocked(plan, rider, x)) {
      offer(
        plan,
        history,
        track,
        rider,
        x,
        cruise,
        LANE_RANK_COST * nearestLaneIndex(plan.lanes, x) + OFF_LANE_COST,
        false
      );
    }
  }
};

export const chooseLine = (
  history: PilotHistory,
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  cruise: number,
  pursuit?: Aim
): Aim => {
  const plan = linePlanOf(state);
  const { aim, choice, lanes, outlook, threats } = plan;
  const sameWayCount = track.sameWayLanes.length;
  fillLanes(plan, track);
  gatherInReach(plan, state, riderIndex, rider);
  gatherLaneThreats(plan, state, rider);
  gatherInSight(outlook, state, rider);
  const kept = rider.pilotLine;
  plan.weighing = outlook.sighted > 0 || Number.isFinite(kept);
  plan.weighedCount = 0;
  choice.cost = Number.POSITIVE_INFINITY;
  if (plan.weighing) {
    measureDeceleration(track, rider);
    planForecast(history, track, rider);
    gatherObstructions(outlook, state, track, rider);
    measureHorizons(outlook);
    planCourse(history, outlook, track, rider);
  }
  if (pursuit) {
    offer(
      plan,
      history,
      track,
      rider,
      pursuit.x,
      pursuit.speed,
      PURSUIT_COST,
      false
    );
  }
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    if (
      lane !== undefined &&
      !threatened(threats[index]) &&
      !crossesBlocked(plan, rider, lane)
    ) {
      offer(
        plan,
        history,
        track,
        rider,
        lane,
        cruise,
        LANE_RANK_COST * index,
        false
      );
    }
  }
  if (plan.weighing) {
    offerFollow(plan, history, track, rider);
    offLaneLines(plan, state, rider);
    for (let index = 0; index < plan.offLaneCount; index += 1) {
      offerBetweenLanes(
        plan,
        history,
        state,
        track,
        rider,
        plan.offLane[index] ?? 0,
        cruise
      );
    }
  }
  if (choice.cost < Number.POSITIVE_INFINITY) {
    const stays = Math.abs(choice.x - kept) < LINE_MATCH;
    rider.pilotLine = outlook.sighted > 0 || stays ? choice.x : Number.NaN;
    slickAhead.metres = choice.slickMetres;
    slickAhead.speed = choice.slickSpeed;
    aim.speed = choice.speed;
    aim.x = choice.x;
    return aim;
  }
  rider.pilotLine = Number.NaN;
  const current = nearestLaneIndex(lanes, rider.x);
  const neighbour = neighbourOf(lanes, sameWayCount, current);
  const pace = threats[neighbour < sameWayCount ? neighbour : current];
  aim.speed = Math.min(cruise, Math.max(0, pace?.speed ?? 0) + SPLITTING_SPEED);
  aim.x = seamOf(lanes, sameWayCount, current, neighbour);
  return aim;
};
