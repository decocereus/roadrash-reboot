import { nextSeed, unitOf } from "@racer/track/random";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { nearestRival } from "./combat.ts";
import { isDown, PATROL_SPEED, PULL_OVER } from "./police.ts";
import {
  BIKE_HALF_WIDTH,
  clamp,
  curvePushOf,
  lateralSpeedLimit,
} from "./state.ts";
import type { RaceState, RiderInput, RiderState } from "./state.ts";

const CORNER_CONFIDENCE = 0.72;
const PLANNED_BRAKING = 6.5;
const SCAN_STEP = 10;
const LANE_CHANGE_RATE = 1.2;
const MAX_LATERAL_SPEED = 5;
const FOLLOW_SECONDS = 2.4;
const ONCOMING_SECONDS = 4.5;
const LANE_REACH = 1.7;
const SPLITTING_SPEED = 8;
const RIDER_FOLLOW_SECONDS = 1.2;
const ATTACK_CHANCE_PER_SECOND = 1.4;
const TRUCE_TICKS = 180;
const COP_TOP_SPEED = 54;
const CATCH_UP_RATE = 0.8;
const ALONGSIDE = 1.5;
const BODY_CREEP_SPEED = 3;
const PATROL_END_MARGIN = 80;
const PULL_OVER_CRAWL = 6;

const cornerSpeedLimit = (
  state: RaceState,
  track: Track,
  rider: RiderState
): number => {
  const lateralLimit =
    lateralSpeedLimit(state.bike, 60) *
    state.bike.curvePush *
    CORNER_CONFIDENCE;
  const horizon = (rider.speed * rider.speed) / (2 * PLANNED_BRAKING) + 40;
  let limit = Number.POSITIVE_INFINITY;
  for (let ahead = 0; ahead < horizon; ahead += SCAN_STEP) {
    const bend = Math.abs(curvatureAt(track, rider.s + ahead));
    if (bend > 1e-5) {
      const cornerSpeed = Math.sqrt(lateralLimit / bend);
      limit = Math.min(
        limit,
        Math.sqrt(cornerSpeed * cornerSpeed + 2 * PLANNED_BRAKING * ahead)
      );
    }
  }
  return limit;
};

interface Threat {
  readonly speed: number;
}

interface Obstacle {
  readonly s: number;
  readonly x: number;
  readonly speed: number;
  readonly halfLength: number;
}

const secondsUntilContact = (rider: RiderState, obstacle: Obstacle): number => {
  const gap = obstacle.s - rider.s - obstacle.halfLength - 1;
  const closingSpeed = rider.speed - obstacle.speed;
  if (gap < -2 * obstacle.halfLength - 2 || closingSpeed <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, gap) / closingSpeed;
};

const riderObstacle = (other: RiderState): Obstacle => ({
  halfLength: 1,
  s: other.mode === "riding" ? other.s : other.bodyS,
  speed: other.mode === "riding" ? other.speed : 0,
  x: other.mode === "riding" ? other.x : other.bodyX,
});

const laneThreat = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  laneX: number
): Threat | undefined => {
  let threat: Threat | undefined;
  let soonest = Number.POSITIVE_INFINITY;
  const consider = (obstacle: Obstacle, horizon: number) => {
    if (Math.abs(obstacle.x - laneX) < LANE_REACH) {
      const seconds = secondsUntilContact(rider, obstacle);
      if (seconds < horizon && seconds < soonest) {
        soonest = seconds;
        threat = obstacle;
      }
    }
  };
  for (const car of state.cars) {
    consider(car, car.speed < 0 ? ONCOMING_SECONDS : FOLLOW_SECONDS);
  }
  for (const [index, other] of state.riders.entries()) {
    if (index !== riderIndex) {
      consider(riderObstacle(other), RIDER_FOLLOW_SECONDS);
    }
  }
  return threat;
};

interface Aim {
  readonly speed: number;
  readonly x: number;
}

const laneAim = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  ownLane: number,
  cruise: number
): Aim => {
  const ahead = laneThreat(state, riderIndex, rider, ownLane);
  if (!ahead) {
    return { speed: cruise, x: ownLane };
  }
  if (laneThreat(state, riderIndex, rider, -ownLane)) {
    return {
      speed: Math.min(cruise, Math.max(0, ahead.speed) + SPLITTING_SPEED),
      x: 0,
    };
  }
  return { speed: cruise, x: -ownLane };
};

const copAim = (
  state: RaceState,
  track: Track,
  cop: RiderState
): Aim | undefined => {
  if (cop.s > track.length - PATROL_END_MARGIN) {
    const offRoad = cop.x > track.roadHalfWidth + BIKE_HALF_WIDTH;
    return {
      speed: offRoad ? 0 : PULL_OVER_CRAWL,
      x: track.roadHalfWidth + PULL_OVER,
    };
  }
  const target = state.riders[cop.chase];
  if (!target) {
    return undefined;
  }
  if (isDown(target)) {
    const gap = Math.max(0, target.bodyS - cop.s - 1);
    return {
      speed: Math.max(BODY_CREEP_SPEED, Math.sqrt(2 * PLANNED_BRAKING * gap)),
      x: target.bodyX,
    };
  }
  const side = cop.x < target.x ? -1 : 1;
  const catchUp = clamp((target.s - cop.s) * CATCH_UP_RATE, -6, 14);
  return {
    speed: Math.min(COP_TOP_SPEED, target.speed + catchUp),
    x: target.x + side * ALONGSIDE,
  };
};

const cruiseSpeed = (rider: RiderState): number =>
  rider.profile.role === "racer" ? Number.POSITIVE_INFINITY : PATROL_SPEED;

const ride = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  aim: Aim,
  input: RiderInput
): void => {
  const lateralSpeed = clamp(
    (aim.x - rider.x) * LANE_CHANGE_RATE,
    -MAX_LATERAL_SPEED,
    MAX_LATERAL_SPEED
  );
  const push = curvePushOf(
    state.bike,
    curvatureAt(track, rider.s),
    rider.speed
  );
  input.steer = clamp(
    (lateralSpeed + push) /
      Math.max(1, lateralSpeedLimit(state.bike, rider.speed)),
    -1,
    1
  );

  const targetSpeed = Math.min(
    aim.speed,
    cornerSpeedLimit(state, track, rider) * rider.profile.skill
  );
  const excess = rider.speed - targetSpeed;
  input.brake = excess > 1.5 ? clamp(excess / 6, 0.25, 1) : 0;
  if (excess < -1) {
    input.throttle = 1;
  } else {
    input.throttle = excess < 0 ? 0.4 : 0;
  }
};

const roll = (state: RaceState): number => {
  state.dice = nextSeed(state.dice);
  return unitOf(state.dice);
};

const fight = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  input: RiderInput
): void => {
  input.punch = false;
  input.kick = false;
  const left = nearestRival(state, riderIndex, -1);
  const target =
    state.riders[left >= 0 ? left : nearestRival(state, riderIndex, 1)];
  const hostile =
    target !== undefined && state.tick > TRUCE_TICKS && rider.attack === "none";
  if (!hostile || rider.profile.aggression <= 0) {
    return;
  }
  const chance = (rider.profile.aggression * ATTACK_CHANCE_PER_SECOND) / 60;
  const chosen = roll(state);
  if (chosen >= chance) {
    return;
  }
  const covetsWeapon = rider.weapon === "none" && target.weapon !== "none";
  input.kick = covetsWeapon ? chosen < chance * 0.7 : chosen < chance / 3;
  input.punch = !input.kick;
};

export const pilotInput = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  input: RiderInput
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  const aim =
    (rider.profile.role === "police"
      ? copAim(state, track, rider)
      : undefined) ??
    laneAim(
      state,
      riderIndex,
      rider,
      track.plan.laneWidth / 2,
      cruiseSpeed(rider)
    );
  ride(state, track, rider, aim, input);
  fight(state, riderIndex, rider, input);
};
