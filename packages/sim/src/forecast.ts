import {
  flatFlightLength,
  lipOf,
  lipSlopeOf,
  nextJumpFrom,
} from "@racer/track/features";
import type { TrackFeature } from "@racer/track/features";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { streetBike } from "./bikes.ts";
import { CONTROL_RAMP } from "./engine.ts";
import { greaseOf, rockUpsetShare } from "./hazards.ts";
import {
  brakingOf,
  carContactOf,
  driftOf,
  HARD_LANDING,
  LANDING_SLIP,
  lockOf,
  settleGrip,
  steerLateral,
} from "./rider.ts";
import type { Motion } from "./rider.ts";
import {
  approach,
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  curvePushOf,
  GRAVITY,
  lateralSpeedLimit,
  TICK_SECONDS,
  WALKING_PACE,
} from "./state.ts";
import type {
  BikeSpec,
  Hazard,
  RaceState,
  RiderState,
  TrafficCar,
} from "./state.ts";

const LANE_CHANGE_RATE = 1.2;
const MAX_LATERAL_SPEED = 5;
const SLIPPING = 0.2;
const SLIPPING_STEER = 0.45;
const BRAKE_FROM_EXCESS = 1.5;
const BRAKE_PER_EXCESS = 1 / 6;
const LIGHTEST_BRAKE = 0.25;
export const CRUISE_THROTTLE = 0.6;
const JUMP_IMPACT_MARGIN = 0.9;
const RAMP_SIDE_MARGIN = 0.3;
const STEP_TICKS = 3;
const STEP_SECONDS = STEP_TICKS * TICK_SECONDS;
const FORECAST_SECONDS = 3.5;
const CONTACT_MARGIN = 0.1;
const CAR_SLACK = 0.1;
const GLANCE_COST = 2;
const BUMP_COST = 1;
const CORRIDOR_SLACK = 1;
const POTHOLE_COST = 0.6;
const OIL_COST = 1;
const ROCK_COST = 2;
const ROCK_COST_PER_SPEED = 2;
const ROCK_FAST = 55.6;
export const ROCK_THROUGH_SPEED = 150 / 3.6;
const ROCK_LANDING_SHARE = 0.85;
const LANDING_SEARCH_STEPS = 8;
const SPEED_SLACK = 0.5;
const FORECAST_REACH = 2;
export const CRASH_COST = 10;
const BRAKING_COST = 5;

export const steerToward = (
  motion: Motion,
  aimX: number,
  curvature: number
): number => {
  const { bike } = motion;
  const settling =
    (motion.lateralSpeed * Math.abs(motion.lateralSpeed)) /
    (2 * bike.steerRate);
  const lateralSpeed = clamp(
    (aimX - motion.x - settling) * LANE_CHANGE_RATE,
    -MAX_LATERAL_SPEED,
    MAX_LATERAL_SPEED
  );
  const push = curvePushOf(bike, curvature, motion.speed);
  const steerLimit = motion.slip > SLIPPING ? SLIPPING_STEER : 1;
  return clamp(
    (lateralSpeed + push) / Math.max(1, lateralSpeedLimit(bike, motion.speed)),
    -steerLimit,
    steerLimit
  );
};

export const brakeFor = (excess: number): number =>
  excess > BRAKE_FROM_EXCESS
    ? clamp(excess * BRAKE_PER_EXCESS, LIGHTEST_BRAKE, 1)
    : 0;

export const safeLaunchSpeed = (jump: TrackFeature): number => {
  const impact = -HARD_LANDING * JUMP_IMPACT_MARGIN;
  const fall = 2 * GRAVITY * jump.rise;
  return impact * impact > fall
    ? Math.sqrt(impact * impact - fall) / lipSlopeOf(jump)
    : 0;
};

const hazardCost = (hazard: Hazard, speed: number): number => {
  if (hazard.kind === "rock") {
    return ROCK_COST + ROCK_COST_PER_SPEED * (speed / ROCK_FAST) ** 2;
  }
  return hazard.kind === "oil" ? OIL_COST : POTHOLE_COST;
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

type ObstructionKind = Hazard["kind"] | "car";

interface Obstruction {
  kind: ObstructionKind;
  s: number;
  speed: number;
  x: number;
  length: number;
  reach: number;
  cost: number;
  curvature: number;
  touching: boolean;
}

const obstructions: Obstruction[] = [];
let obstructionCount = 0;
let ahead: TrackFeature | undefined;

const nextObstruction = (): Obstruction => {
  let obstruction = obstructions[obstructionCount];
  if (!obstruction) {
    obstruction = {
      cost: 0,
      curvature: 0,
      kind: "car",
      length: 0,
      reach: 0,
      s: 0,
      speed: 0,
      touching: false,
      x: 0,
    };
    obstructions.push(obstruction);
  }
  obstructionCount += 1;
  return obstruction;
};

const meets = (rider: RiderState, car: TrafficCar): boolean => {
  const closing = rider.speed - car.speed;
  const gap = car.s - rider.s;
  const length = car.halfLength + BIKE_HALF_LENGTH;
  return (
    gap + length > 0 &&
    closing > 0 &&
    (gap - length) / closing <= FORECAST_SECONDS * FORECAST_REACH
  );
};

export const jumpAhead = (
  track: Track,
  rider: RiderState,
  sight: number
): number => {
  const index = nextJumpFrom(track, rider.s);
  const jump = track.features[index];
  return jump && jump.s - rider.s <= sight ? index : -1;
};

export const gatherObstructions = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  inSight: readonly number[],
  jumpIndex: number
): number => {
  obstructionCount = 0;
  ahead = track.features[jumpIndex];
  for (const index of inSight) {
    const hazard = state.hazards[index];
    if (hazard) {
      const obstruction = nextObstruction();
      obstruction.kind = hazard.kind;
      obstruction.s = hazard.s;
      obstruction.speed = 0;
      obstruction.x = hazard.x;
      obstruction.length = hazard.halfLength + BIKE_HALF_LENGTH;
      obstruction.reach = hazard.halfWidth + BIKE_HALF_WIDTH + CONTACT_MARGIN;
      obstruction.cost = hazardCost(hazard, rider.speed);
      obstruction.curvature = curvatureAt(track, hazard.s);
    }
  }
  for (const car of state.cars) {
    if (meets(rider, car)) {
      const obstruction = nextObstruction();
      obstruction.kind = "car";
      obstruction.s = car.s;
      obstruction.speed = car.speed;
      obstruction.x = car.x;
      obstruction.length = car.halfLength + BIKE_HALF_LENGTH;
      obstruction.reach = car.halfWidth + BIKE_HALF_WIDTH + CAR_SLACK;
      obstruction.cost = CRASH_COST;
      obstruction.curvature = 0;
    }
  }
  for (let index = 0; index < obstructionCount; index += 1) {
    const obstruction = obstructions[index];
    if (obstruction) {
      obstruction.touching =
        Math.abs(obstruction.s - rider.s) < obstruction.length &&
        Math.abs(obstruction.x - rider.x) < obstruction.reach;
    }
  }
  return obstructionCount;
};

interface Outlook {
  cost: number;
  crashed: boolean;
  floor: number;
}

const outlook: Outlook = {
  cost: 0,
  crashed: false,
  floor: Number.POSITIVE_INFINITY,
};

interface Run {
  bike: BikeSpec;
  weapon: RiderState["weapon"];
  hitStun: number;
  s: number;
  x: number;
  speed: number;
  lateralSpeed: number;
  slip: number;
  wobble: number;
  brake: number;
  aloft: number;
  onDeck: boolean;
  seconds: number;
  horizon: number;
}

const run: Run = {
  aloft: 0,
  bike: streetBike,
  brake: 0,
  hitStun: 0,
  horizon: 0,
  lateralSpeed: 0,
  onDeck: false,
  s: 0,
  seconds: 0,
  slip: 0,
  speed: 0,
  weapon: "none",
  wobble: 0,
  x: 0,
};

const near: boolean[] = [];
const struck: boolean[] = [];

const secondsAloft = (air: number, verticalSpeed: number): number =>
  (verticalSpeed +
    Math.sqrt(Math.max(0, verticalSpeed ** 2 + 2 * GRAVITY * air))) /
  GRAVITY;

const startRun = (rider: RiderState, line: number): void => {
  run.bike = rider.bike;
  run.weapon = rider.weapon;
  run.hitStun = rider.hitStun;
  run.s = rider.s;
  run.x = rider.x;
  run.speed = rider.speed;
  run.lateralSpeed = rider.lateralSpeed;
  run.slip = rider.slip;
  run.wobble = rider.wobble;
  run.brake = rider.brake;
  run.aloft = rider.airborne
    ? secondsAloft(Math.max(0, rider.air), rider.verticalSpeed)
    : 0;
  run.onDeck =
    !rider.airborne &&
    ahead !== undefined &&
    ahead.s <= rider.s &&
    Math.abs(rider.x - ahead.x) <= ahead.width / 2;
  run.seconds = 0;
  run.horizon = FORECAST_SECONDS + run.aloft;
  const low = Math.min(rider.x, line) - CORRIDOR_SLACK;
  const high = Math.max(rider.x, line) + CORRIDOR_SLACK;
  for (let index = 0; index < obstructionCount; index += 1) {
    const obstruction = obstructions[index];
    near[index] =
      obstruction !== undefined &&
      Math.abs(clamp(obstruction.x, low, high) - obstruction.x) <
        obstruction.reach;
    struck[index] = obstruction?.touching ?? false;
  }
  outlook.cost = 0;
  outlook.crashed = false;
  outlook.floor = Number.POSITIVE_INFINITY;
};

const crash = (floor: number): void => {
  outlook.crashed = true;
  outlook.cost += CRASH_COST;
  outlook.floor = Math.min(outlook.floor, floor);
};

const needs = (allowed: number, braking: boolean): void => {
  if (run.speed <= allowed + SPEED_SLACK) {
    return;
  }
  if (braking) {
    crash(allowed);
  } else {
    outlook.floor = Math.min(outlook.floor, allowed);
  }
};

const advance = (track: Track, line: number, target: number): void => {
  const curvature = curvatureAt(track, run.s);
  if (run.aloft > 0) {
    run.x +=
      (run.lateralSpeed - curvePushOf(run.bike, curvature, run.speed)) *
      STEP_SECONDS;
    run.aloft -= STEP_SECONDS;
  } else {
    settleGrip(run, STEP_SECONDS);
    const excess = run.speed - target;
    const steer = steerToward(
      run,
      run.onDeck && ahead ? ahead.x : line,
      curvature
    );
    const limit = steerLateral(
      track,
      run,
      steer,
      excess > 0 ? 0 : CRUISE_THROTTLE,
      STEP_SECONDS
    );
    const push = driftOf(run, curvature);
    run.brake = approach(
      run.brake,
      brakeFor(excess),
      CONTROL_RAMP * STEP_SECONDS
    );
    const slowing =
      brakingOf(run, run.brake, lockOf(run, limit)) +
      (excess > 0 ? run.bike.engineBraking : 0);
    run.speed = Math.max(
      Math.min(run.speed, Math.max(target, 0)),
      run.speed - slowing * STEP_SECONDS
    );
    run.x += (run.lateralSpeed - push) * STEP_SECONDS;
  }
  run.s += run.speed * STEP_SECONDS;
  run.seconds += STEP_SECONDS;
};

const rampAt = (fromS: number, braking: boolean, blind: boolean): void => {
  const jump = ahead;
  if (!jump || run.aloft > 0) {
    return;
  }
  const lip = lipOf(jump);
  const off = Math.abs(run.x - jump.x);
  if (run.onDeck) {
    if (fromS < lip && run.s >= lip) {
      needs(safeLaunchSpeed(jump), braking);
      run.onDeck = false;
      run.aloft = flatFlightLength(jump, run.speed) / Math.max(1, run.speed);
      run.horizon += run.aloft;
    }
    return;
  }
  if (fromS < jump.s && run.s >= jump.s) {
    if (off <= jump.width / 2 - BIKE_HALF_WIDTH) {
      run.onDeck = true;
      needs(safeLaunchSpeed(jump), braking);
    } else if (
      !blind &&
      off < jump.width / 2 + BIKE_HALF_WIDTH + RAMP_SIDE_MARGIN
    ) {
      crash(0);
    }
  } else if (
    !blind &&
    run.s > jump.s &&
    fromS < lip &&
    off < jump.width / 2 + BIKE_HALF_WIDTH
  ) {
    crash(0);
  }
};

const sideGapOf = (
  obstruction: Obstruction,
  fromS: number,
  fromX: number
): number => {
  const before =
    obstruction.s + obstruction.speed * (run.seconds - STEP_SECONDS) - fromS;
  const after = obstruction.s + obstruction.speed * run.seconds - run.s;
  if (
    Math.min(before, after) >= obstruction.length ||
    Math.max(before, after) <= -obstruction.length
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const was = fromX - obstruction.x;
  const is = run.x - obstruction.x;
  const gap = was * is <= 0 ? 0 : Math.min(Math.abs(was), Math.abs(is));
  return gap - obstruction.reach;
};

const behindSpeedOf = (carSpeed: number): number => {
  if (carSpeed >= WALKING_PACE) {
    return carSpeed;
  }
  return carSpeed > -WALKING_PACE ? WALKING_PACE : 0;
};

const meetCar = (obstruction: Obstruction, sideGap: number): void => {
  const contact = carContactOf(sideGap, run.speed - obstruction.speed);
  if (contact === "glance") {
    outlook.cost += GLANCE_COST;
  } else if (contact === "bump") {
    outlook.cost += BUMP_COST;
    if (obstruction.speed >= WALKING_PACE) {
      outlook.floor = Math.min(outlook.floor, obstruction.speed);
    }
    run.speed = Math.max(
      Math.min(run.speed, WALKING_PACE),
      Math.min(run.speed, obstruction.speed) - 1
    );
  } else {
    crash(behindSpeedOf(obstruction.speed));
  }
};

const meet = (
  obstruction: Obstruction,
  sideGap: number,
  braking: boolean
): void => {
  if (obstruction.kind === "car") {
    meetCar(obstruction, sideGap);
    return;
  }
  outlook.cost += obstruction.cost;
  if (obstruction.kind === "oil") {
    greaseOf(run);
  } else if (obstruction.kind === "rock") {
    const landing = rockLandingSpeed(
      run.bike,
      run.lateralSpeed -
        curvePushOf(run.bike, obstruction.curvature, run.speed),
      obstruction.curvature,
      run.speed
    );
    needs(Math.min(landing, ROCK_THROUGH_SPEED), braking);
  }
};

const meetObstructions = (
  fromS: number,
  fromX: number,
  braking: boolean
): boolean => {
  let pending = false;
  for (let index = 0; index < obstructionCount; index += 1) {
    const obstruction = obstructions[index];
    if (obstruction && near[index] && !struck[index]) {
      const sideGap =
        obstruction.kind === "car" || run.aloft <= 0
          ? sideGapOf(obstruction, fromS, fromX)
          : Number.POSITIVE_INFINITY;
      if (sideGap < 0) {
        struck[index] = true;
        meet(obstruction, sideGap, braking);
      } else if (
        run.s - obstruction.length <
        obstruction.s + obstruction.speed * run.seconds
      ) {
        pending = true;
      }
    }
  }
  return pending;
};

const forecast = (
  track: Track,
  rider: RiderState,
  line: number,
  target: number,
  braking: boolean,
  blind: boolean,
  bound: number
): void => {
  startRun(rider, line);
  while (run.seconds < run.horizon) {
    const fromS = run.s;
    const fromX = run.x;
    advance(track, line, target);
    rampAt(fromS, braking, blind);
    const pending = meetObstructions(fromS, fromX, braking);
    if (outlook.crashed || outlook.cost >= bound) {
      return;
    }
    const rampPending =
      ahead !== undefined && (run.aloft > 0 || run.s < lipOf(ahead));
    if (!pending && !rampPending) {
      return;
    }
  }
};

export interface Weighing {
  cost: number;
  speed: number;
}

const weighing: Weighing = { cost: 0, speed: 0 };

export const weighLine = (
  track: Track,
  rider: RiderState,
  line: number,
  target: number,
  reference: number,
  blind: boolean,
  bound: number
): Weighing => {
  forecast(track, rider, line, target, false, blind, bound);
  const { cost, crashed, floor } = outlook;
  const paced = crashed ? Math.min(target, floor) : target;
  const slowing =
    (BRAKING_COST * Math.max(0, reference - paced)) / Math.max(1, reference);
  weighing.cost = cost + slowing;
  weighing.speed = Math.min(target, floor);
  if (!crashed && (floor >= target || cost >= bound)) {
    return weighing;
  }
  if (slowing >= bound) {
    return weighing;
  }
  forecast(track, rider, line, weighing.speed, true, blind, bound - slowing);
  weighing.cost =
    crashed && outlook.crashed
      ? Math.min(cost, outlook.cost) + slowing
      : outlook.cost + slowing;
  return weighing;
};
