import { hypot2 } from "@racer/track/math";
import type { Track } from "@racer/track/track";

import { pullOver } from "./police.ts";
import {
  approach,
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  GRAVITY,
  TICK_SECONDS,
  WALKING_PACE,
} from "./state.ts";
import type { RaceState, RiderInput, RiderState } from "./state.ts";
import { rearm } from "./weapons.ts";

const BODY_GROUND_DECELERATION = 6;
const BIKE_SLIDE_DECELERATION = 5;
export const RUN_SPEED = 7;
const RUN_ACCELERATION = 28;
const RISE_TICKS = 18;
const IDLE_WALK_TICKS = 240;
const MOUNT_REACH = 0.7;
const MOUNT_TICKS = 30;
const SETTLE_TICKS = 50;
const LIE_TICKS = 30;
const KNOCKDOWN_KEEP = 0.25;
const KNOCKDOWN_LIFT = 2.5;
const KNOCKDOWN_HOP = 0.3;
const BODY_REACH = 0.5;
const RUN_OVER_SPEED_LOSS = 0.1;
const REMOUNT_STAMINA = 55;

const slide = (track: Track, rider: RiderState): boolean => {
  rider.modeTicks += 1;
  rider.bodyVerticalSpeed -= GRAVITY * TICK_SECONDS;
  rider.bodyAir += rider.bodyVerticalSpeed * TICK_SECONDS;
  if (rider.bodyAir <= 0) {
    rider.bodyAir = 0;
    rider.bodyVerticalSpeed =
      rider.bodyVerticalSpeed < -3 ? -rider.bodyVerticalSpeed * 0.35 : 0;
    rider.bodySpeed = approach(
      rider.bodySpeed,
      0,
      BODY_GROUND_DECELERATION * TICK_SECONDS
    );
    rider.bodyLateralSpeed = approach(
      rider.bodyLateralSpeed,
      0,
      6 * TICK_SECONDS
    );
  }
  rider.bodyS += rider.bodySpeed * TICK_SECONDS;
  rider.bodyX = clamp(
    rider.bodyX + rider.bodyLateralSpeed * TICK_SECONDS,
    -track.vergeHalfWidth,
    track.vergeHalfWidth
  );

  rider.speed = approach(
    rider.speed,
    0,
    BIKE_SLIDE_DECELERATION * TICK_SECONDS
  );
  rider.lateralSpeed = approach(rider.lateralSpeed, 0, 6 * TICK_SECONDS);
  rider.s += rider.speed * TICK_SECONDS;
  rider.x = clamp(
    rider.x + rider.lateralSpeed * TICK_SECONDS,
    -track.vergeHalfWidth,
    track.vergeHalfWidth
  );
  rider.air = Math.max(0, rider.air - 8 * TICK_SECONDS);
  rider.lean = approach(
    rider.lean,
    rider.lean >= 0 ? 1.4 : -1.4,
    5 * TICK_SECONDS
  );

  const settled =
    rider.bodyAir === 0 && rider.bodySpeed < 0.3 && rider.speed < 0.3;
  return settled && rider.modeTicks > SETTLE_TICKS;
};

const tumble = (track: Track, rider: RiderState): void => {
  if (slide(track, rider)) {
    rider.mode = "lying";
    rider.modeTicks = 0;
    rider.speed = 0;
    rider.bodySpeed = 0;
    rider.bodyLateralSpeed = 0;
  }
};

const knockDown = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  by: number,
  speed: number
): void => {
  rider.mode = "thrown";
  rider.modeTicks = 0;
  rider.bodySpeed = speed * KNOCKDOWN_KEEP;
  rider.bodyLateralSpeed = 0;
  rider.bodyVerticalSpeed = KNOCKDOWN_LIFT;
  rider.bodyAir = KNOCKDOWN_HOP;
  if (by >= 0) {
    rider.lastHitBy = by;
    rider.lastHitTick = state.tick;
  }
  state.events.push({
    by,
    kind: "knockedDown",
    rider: riderIndex,
    speed: Math.abs(speed),
  });
};

const overBody = (
  rider: RiderState,
  s: number,
  x: number,
  halfLength: number,
  halfWidth: number
): boolean =>
  Math.abs(s - rider.bodyS) < halfLength + BODY_REACH &&
  Math.abs(x - rider.bodyX) < halfWidth + BODY_REACH;

const hitOnFoot = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState
): boolean => {
  for (const car of state.cars) {
    if (
      Math.abs(car.speed) > WALKING_PACE &&
      overBody(rider, car.s, car.x, car.halfLength, car.halfWidth)
    ) {
      knockDown(state, riderIndex, rider, -1, car.speed);
      return true;
    }
  }
  for (const [index, other] of state.riders.entries()) {
    if (
      index !== riderIndex &&
      other.mode === "riding" &&
      other.speed > WALKING_PACE &&
      overBody(rider, other.s, other.x, BIKE_HALF_LENGTH, BIKE_HALF_WIDTH)
    ) {
      other.speed *= 1 - RUN_OVER_SPEED_LOSS;
      state.events.push({ kind: "bump", rider: index });
      knockDown(state, riderIndex, rider, index, other.speed);
      return true;
    }
  }
  return false;
};

const lie = (state: RaceState, riderIndex: number, rider: RiderState): void => {
  if (hitOnFoot(state, riderIndex, rider)) {
    return;
  }
  rider.modeTicks += 1;
  if (rider.modeTicks >= LIE_TICKS) {
    rider.mode = "running";
    rider.modeTicks = 0;
  }
};

const comeToRest = (track: Track, rider: RiderState): void => {
  if (!rider.parked && slide(track, rider)) {
    pullOver(track, rider);
    rider.parked = true;
  }
};

const atTheBike = (rider: RiderState): boolean =>
  hypot2(rider.s - rider.bodyS, rider.x - rider.bodyX) < MOUNT_REACH;

interface Stride {
  readonly along: number;
  readonly across: number;
}

export const towardBike = (rider: RiderState): Stride => {
  const gapS = rider.s - rider.bodyS;
  const gapX = rider.x - rider.bodyX;
  const distance = Math.max(1e-6, hypot2(gapS, gapX));
  return { across: gapX / distance, along: gapS / distance };
};

const releaseHeldInput = (rider: RiderState, input: RiderInput): void => {
  rider.staleThrottle &&= input.throttle !== 0;
  rider.staleBrake &&= input.brake !== 0;
  rider.staleSteer &&= input.steer !== 0;
};

const strideOf = (rider: RiderState, input: RiderInput): Stride => {
  const throttle = rider.staleThrottle ? 0 : input.throttle;
  const brake = rider.staleBrake ? 0 : input.brake;
  const steer = rider.staleSteer ? 0 : input.steer;
  const chosen = {
    across: clamp(steer, -1, 1),
    along: clamp(throttle - brake, -1, 1),
  };
  rider.idleTicks =
    chosen.along === 0 && chosen.across === 0 ? rider.idleTicks + 1 : 0;
  return rider.idleTicks > IDLE_WALK_TICKS ? towardBike(rider) : chosen;
};

const run = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  input: RiderInput
): void => {
  if (hitOnFoot(state, riderIndex, rider)) {
    return;
  }
  rider.modeTicks += 1;
  if (atTheBike(rider)) {
    rider.mode = "mounting";
    rider.modeTicks = 0;
    rider.bodySpeed = 0;
    rider.bodyLateralSpeed = 0;
    return;
  }
  if (rider.modeTicks < RISE_TICKS) {
    return;
  }
  const { across, along } = strideOf(rider, input);
  const effort = Math.max(1, hypot2(along, across));
  const step = RUN_ACCELERATION * TICK_SECONDS;
  rider.bodySpeed = approach(
    rider.bodySpeed,
    (along / effort) * RUN_SPEED,
    step
  );
  rider.bodyLateralSpeed = approach(
    rider.bodyLateralSpeed,
    (across / effort) * RUN_SPEED,
    step
  );
  rider.bodyS = clamp(
    rider.bodyS + rider.bodySpeed * TICK_SECONDS,
    Math.min(rider.s, 0),
    Math.max(rider.s, track.length)
  );
  rider.bodyX = clamp(
    rider.bodyX + rider.bodyLateralSpeed * TICK_SECONDS,
    -track.vergeHalfWidth,
    track.vergeHalfWidth
  );
};

const mount = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState
): void => {
  rider.modeTicks += 1;
  rider.lean = approach(rider.lean, 0, 4 * TICK_SECONDS);
  rider.heading = 0;
  rider.lateralSpeed = 0;
  if (rider.modeTicks < MOUNT_TICKS) {
    return;
  }
  rider.mode = "riding";
  rider.modeTicks = 0;
  rider.lean = 0;
  rider.heading = 0;
  rider.throttle = 0;
  rider.brake = 0;
  rider.stamina = Math.max(rider.stamina, REMOUNT_STAMINA);
  rearm(rider);
  state.events.push({ kind: "remount", rider: riderIndex });
};

export const stepOffBike = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  input: RiderInput
): void => {
  releaseHeldInput(rider, input);
  if (rider.mode === "wrecked") {
    comeToRest(track, rider);
  } else if (rider.mode === "thrown") {
    tumble(track, rider);
  } else if (rider.mode === "lying") {
    lie(state, riderIndex, rider);
  } else if (rider.mode === "running") {
    run(state, track, riderIndex, rider, input);
  } else if (rider.mode === "mounting") {
    mount(state, riderIndex, rider);
    rider.bodyS = rider.s;
    rider.bodyX = rider.x;
  }
};
