import { firstSolidPropFrom } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { throwRider } from "./rider-crash.ts";
import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  TICK_SECONDS,
  WALKING_PACE,
} from "./state.ts";
import type { RaceState, RiderState, TrafficCar } from "./state.ts";

const WALL_SPEED_KEEP = 0.98;
const WALL_THROW_HEIGHT = 0.2;
const WALL_THROW_SPEED = 1;
const GLANCE_OVERLAP = 0.3;
const CRASH_CLOSING_SPEED = 9;
const NEAR_MISS_MARGIN = 1.1;
const NEAR_MISS_CLOSING_SPEED = 12;
const PROP_CRASH_SPEED = 7;
const CLEARANCE_OVER_PROPS = 2;
const SIDESTEP_SPEED = 3;
const STEERING_AWAY = 0.5;

export const glancesOff = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  height: number,
  fromX: number
): boolean => {
  if (
    height > WALL_THROW_HEIGHT &&
    Math.abs(rider.lateralSpeed) > WALL_THROW_SPEED
  ) {
    throwRider(state, riderIndex, "prop", 0.5, 0.7);
    return false;
  }
  rider.x = fromX;
  rider.lateralSpeed = 0;
  rider.speed *= WALL_SPEED_KEEP;
  state.events.push({ kind: "glance", rider: riderIndex });
  return true;
};

export const hitProps = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState
): boolean => {
  const props = track.solidProps;
  for (
    let index = firstSolidPropFrom(track, rider.s - 3);
    index < props.length;
    index += 1
  ) {
    const prop = props[index];
    if (!prop || prop.s > rider.s + 3) {
      return false;
    }
    const touching =
      Math.abs(prop.s - rider.s) < prop.radius + BIKE_HALF_LENGTH &&
      Math.abs(prop.x - rider.x) < prop.radius + BIKE_HALF_WIDTH;
    if (touching && rider.air < CLEARANCE_OVER_PROPS) {
      if (rider.speed > PROP_CRASH_SPEED) {
        throwRider(state, riderIndex, "prop", 0.15, 0.5);
        return true;
      }
      rider.x -= Math.sign(prop.x) * 0.06;
      rider.speed = Math.min(rider.speed, 3);
    }
  }
  return false;
};

const wayAround = (rider: RiderState, car: TrafficCar): number => {
  if (Math.abs(rider.lateralSpeed) > STEERING_AWAY) {
    return Math.sign(rider.lateralSpeed);
  }
  return Math.sign(rider.x - car.x) || -Math.sign(car.x) || 1;
};

export const hitCar = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  car: TrafficCar
): boolean => {
  const gapS = car.s - rider.s;
  const gapX = car.x - rider.x;
  const reachS = car.halfLength + BIKE_HALF_LENGTH;
  const reachX = car.halfWidth + BIKE_HALF_WIDTH;
  const closingSpeed = rider.speed - car.speed;
  const sideGap = Math.abs(gapX) - reachX;

  const previousGapS = gapS + closingSpeed * TICK_SECONDS;
  if (
    previousGapS * gapS < 0 &&
    sideGap >= 0 &&
    sideGap < NEAR_MISS_MARGIN &&
    Math.abs(closingSpeed) > NEAR_MISS_CLOSING_SPEED
  ) {
    state.events.push({
      closingSpeed: Math.abs(closingSpeed),
      hazard: null,
      kind: "nearMiss",
      rider: riderIndex,
    });
  }

  if (Math.abs(gapS) >= reachS || sideGap >= 0 || rider.air >= car.height) {
    return false;
  }
  const awayFromCar = gapX > 0 ? -1 : 1;
  if (-sideGap < GLANCE_OVERLAP) {
    rider.x -= awayFromCar * sideGap;
    rider.lateralSpeed = awayFromCar * 2.5;
    rider.speed *= Math.abs(closingSpeed) > 40 ? 0.85 : 0.94;
    state.events.push({ kind: "glance", rider: riderIndex });
    return false;
  }
  if (Math.abs(closingSpeed) > CRASH_CLOSING_SPEED) {
    if (car.speed < 0) {
      throwRider(state, riderIndex, "traffic", 0.1, 0.5);
    } else {
      throwRider(state, riderIndex, "traffic", 0.45, 0.6);
    }
    return true;
  }
  if (gapS > 0) {
    rider.speed = Math.max(
      Math.min(rider.speed, WALKING_PACE),
      Math.min(rider.speed, car.speed) - 1
    );
    rider.s = car.s - reachS;
    if (car.speed < WALKING_PACE) {
      const side = wayAround(rider, car);
      rider.x +=
        side * Math.min(SIDESTEP_SPEED * TICK_SECONDS, reachX + side * gapX);
    }
  } else {
    rider.speed = Math.max(rider.speed, car.speed + 1);
  }
  state.events.push({ kind: "bump", rider: riderIndex });
  return false;
};
