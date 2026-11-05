import { LONGEST_STALL_HALF } from "@racer/track/stalls";
import type { StallFootprint } from "@racer/track/stalls";
import { firstAlong } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { throwRider } from "./rider-crash.ts";
import { BIKE_HALF_LENGTH, BIKE_HALF_WIDTH, WALKING_PACE } from "./state.ts";
import type { RaceState, RiderState } from "./state.ts";

const STALL_CRASH_SPEED = 14;
const STALL_NUDGE = 0.06;
const STALL_BUMP_FROM = WALKING_PACE + 1;
const CLEARS_A_STALL = 2;
const BODY_HALF = 0.3;

const stallOver = (
  { stalls }: Track,
  s: number,
  x: number,
  halfLength: number,
  halfWidth: number
): StallFootprint | null => {
  const reach = LONGEST_STALL_HALF + halfLength;
  for (
    let index = firstAlong(stalls, s - reach);
    index < stalls.length;
    index += 1
  ) {
    const stall = stalls[index];
    if (!stall || stall.s > s + reach) {
      return null;
    }
    if (
      Math.abs(stall.s - s) < stall.halfLength + halfLength &&
      Math.abs(stall.x - x) < stall.halfWidth + halfWidth
    ) {
      return stall;
    }
  }
  return null;
};

const pushBikeOff = (rider: RiderState, toRoad: number): void => {
  rider.x += toRoad * STALL_NUDGE;
  if (rider.lateralSpeed * toRoad < 0) {
    rider.lateralSpeed = 0;
  }
};

const touchStall = (
  state: RaceState,
  rider: RiderState,
  toRoad: number
): void => {
  if (rider.speed > STALL_BUMP_FROM) {
    state.events.push({ kind: "bump", rider: rider.id });
  }
  rider.speed = Math.min(rider.speed, WALKING_PACE);
  pushBikeOff(rider, toRoad);
};

export const hitStalls = (
  state: RaceState,
  track: Track,
  rider: RiderState
): boolean => {
  if (rider.air >= CLEARS_A_STALL) {
    return false;
  }
  const stall = stallOver(
    track,
    rider.s,
    rider.x,
    BIKE_HALF_LENGTH,
    BIKE_HALF_WIDTH
  );
  if (!stall) {
    return false;
  }
  const toRoad = -Math.sign(stall.x);
  if (rider.speed <= STALL_CRASH_SPEED) {
    touchStall(state, rider, toRoad);
    return false;
  }
  throwRider(state, rider, "prop", 0.15, 0.5);
  rider.bodyLateralSpeed = toRoad * Math.abs(rider.bodyLateralSpeed);
  return true;
};

export const stopBikeAtStall = (track: Track, rider: RiderState): void => {
  const stall = stallOver(
    track,
    rider.s,
    rider.x,
    BIKE_HALF_LENGTH,
    BIKE_HALF_WIDTH
  );
  if (stall) {
    rider.speed = 0;
    pushBikeOff(rider, -Math.sign(stall.x));
  }
};

export const stopBodyAtStall = (track: Track, rider: RiderState): void => {
  if (rider.bodyAir >= CLEARS_A_STALL) {
    return;
  }
  const stall = stallOver(
    track,
    rider.bodyS,
    rider.bodyX,
    BODY_HALF,
    BODY_HALF
  );
  if (stall) {
    const toRoad = -Math.sign(stall.x);
    rider.bodySpeed = 0;
    rider.bodyX += toRoad * STALL_NUDGE;
    if (rider.bodyLateralSpeed * toRoad < 0) {
      rider.bodyLateralSpeed = 0;
    }
  }
};
