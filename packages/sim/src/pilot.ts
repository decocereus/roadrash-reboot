import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { clamp, curvePushOf, lateralSpeedLimit } from "./state.ts";
import type { RaceState, RiderInput, RiderState, TrafficCar } from "./state.ts";

const CORNER_CONFIDENCE = 0.72;
const PLANNED_BRAKING = 6.5;
const SCAN_STEP = 10;
const LANE_CHANGE_RATE = 1.2;
const MAX_LATERAL_SPEED = 5;
const FOLLOW_SECONDS = 2.4;
const ONCOMING_SECONDS = 4.5;
const LANE_REACH = 1.7;
const SPLITTING_SPEED = 8;

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

const secondsUntilContact = (rider: RiderState, car: TrafficCar): number => {
  const gap = car.s - rider.s - car.halfLength - 1;
  const closingSpeed = rider.speed - car.speed;
  if (gap < -2 * car.halfLength - 2 || closingSpeed <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, gap) / closingSpeed;
};

const laneThreat = (
  state: RaceState,
  rider: RiderState,
  laneX: number
): TrafficCar | undefined => {
  let threat: TrafficCar | undefined;
  let soonest = Number.POSITIVE_INFINITY;
  for (const car of state.cars) {
    if (Math.abs(car.x - laneX) < LANE_REACH) {
      const horizon = car.speed < 0 ? ONCOMING_SECONDS : FOLLOW_SECONDS;
      const seconds = secondsUntilContact(rider, car);
      if (seconds < horizon && seconds < soonest) {
        soonest = seconds;
        threat = car;
      }
    }
  }
  return threat;
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
  const ownLane = track.plan.laneWidth / 2;
  let targetSpeed = cornerSpeedLimit(state, track, rider);
  let targetX = ownLane;
  const ahead = laneThreat(state, rider, ownLane);
  if (ahead) {
    if (laneThreat(state, rider, -ownLane)) {
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
};
