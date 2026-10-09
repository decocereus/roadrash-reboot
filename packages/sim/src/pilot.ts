import { createRandom } from "@racer/track/random";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { nearestRival } from "./combat.ts";
import { clamp, curvePushOf, lateralSpeedLimit } from "./state.ts";
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

const dice = createRandom(0x5a_17);

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
  const ownLane = track.plan.laneWidth / 2;
  let targetSpeed = cornerSpeedLimit(state, track, rider) * rider.profile.skill;
  let targetX = ownLane;
  const ahead = laneThreat(state, riderIndex, rider, ownLane);
  if (ahead) {
    if (laneThreat(state, riderIndex, rider, -ownLane)) {
      targetX = 0;
      targetSpeed = Math.min(
        targetSpeed,
        Math.max(0, ahead.speed) + SPLITTING_SPEED
      );
    } else {
      targetX = -ownLane;
    }
  }

  const lateralSpeed = clamp(
    (targetX - rider.x) * LANE_CHANGE_RATE,
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

  const excess = rider.speed - targetSpeed;
  input.brake = excess > 1.5 ? clamp(excess / 6, 0.25, 1) : 0;
  if (excess < -1) {
    input.throttle = 1;
  } else {
    input.throttle = excess < 0 ? 0.4 : 0;
  }

  input.punch = false;
  input.kick = false;
  const rivalNear =
    nearestRival(state, riderIndex, -1) >= 0 ||
    nearestRival(state, riderIndex, 1) >= 0;
  const hostile =
    rivalNear && state.tick > TRUCE_TICKS && rider.attack === "none";
  if (hostile && rider.profile.aggression > 0) {
    const roll = dice();
    if (roll < (rider.profile.aggression * ATTACK_CHANCE_PER_SECOND) / 60) {
      input.kick =
        roll < (rider.profile.aggression * ATTACK_CHANCE_PER_SECOND) / 180;
      input.punch = !input.kick;
    }
  }
};
