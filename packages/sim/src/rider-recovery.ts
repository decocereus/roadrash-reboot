import { hypot2 } from "@racer/track/math";
import type { Track } from "@racer/track/track";

import { onRoad } from "./cross-traffic.ts";
import { pullOver } from "./police.ts";
import { damageRunOver } from "./rider-crash.ts";
import {
  approach,
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  GRAVITY,
  TICK_SECONDS,
  WALKING_PACE,
} from "./state.ts";
import type { RaceState, RiderInput, RiderState, TrafficCar } from "./state.ts";
import { rearm } from "./weapons.ts";

const BODY_GROUND_DECELERATION = 10;
const BIKE_SLIDE_DECELERATION = 10;
const TUMBLE_BRAKING = 10;
const TUMBLE_STEER_SPEED = 5;
const TUMBLE_STEER_RATE = 16;
export const RUN_SPEED = 7;
const RUN_ACCELERATION = 28;
const RISE_TICKS = 18;
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
const BIKE_KNOCK_SHARE = 1.4;
const LEAST_BIKE_KNOCK = 5;
const BIKE_KNOCK_ACROSS = 6;

const slideBike = (track: Track, rider: RiderState): void => {
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
};

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

  slideBike(track, rider);
  rider.air = Math.max(0, rider.air - 8 * TICK_SECONDS);
  rider.lean = approach(
    rider.lean,
    rider.lean >= 0 ? 1.4 : -1.4,
    5 * TICK_SECONDS
  );

  const settled =
    rider.bodyAir === 0 && rider.bodySpeed < 0.3 && Math.abs(rider.speed) < 0.3;
  return settled && rider.modeTicks > SETTLE_TICKS;
};

const steerTumble = (rider: RiderState, input: RiderInput): void => {
  rider.bodySpeed = approach(
    rider.bodySpeed,
    0,
    clamp(input.brake, 0, 1) * TUMBLE_BRAKING * TICK_SECONDS
  );
  if (input.steer !== 0) {
    rider.bodyLateralSpeed = approach(
      rider.bodyLateralSpeed,
      clamp(input.steer, -1, 1) * TUMBLE_STEER_SPEED,
      TUMBLE_STEER_RATE * TICK_SECONDS
    );
  }
};

const tumble = (track: Track, rider: RiderState, input: RiderInput): void => {
  steerTumble(rider, input);
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
  rider: RiderState,
  by: RiderState | null,
  speed: number
): void => {
  rider.mode = "thrown";
  rider.modeTicks = 0;
  rider.bodySpeed = speed * KNOCKDOWN_KEEP;
  rider.bodyLateralSpeed = 0;
  rider.bodyVerticalSpeed = KNOCKDOWN_LIFT;
  rider.bodyAir = KNOCKDOWN_HOP;
  if (by) {
    rider.lastHitBy = by.id;
    rider.lastHitTick = state.tick;
  }
  state.events.push({
    by: by?.id ?? null,
    kind: "knockedDown",
    rider: rider.id,
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

const hitOnFoot = (state: RaceState, rider: RiderState): boolean => {
  for (const car of state.cars) {
    if (
      Math.abs(car.speed) > WALKING_PACE &&
      overBody(rider, car.s, car.x, car.halfLength, car.halfWidth)
    ) {
      knockDown(state, rider, null, car.speed);
      return true;
    }
  }
  for (const car of state.crossCars) {
    if (
      onRoad(car) &&
      car.pace > WALKING_PACE &&
      overBody(rider, car.s, car.x, car.halfLength, car.halfWidth)
    ) {
      knockDown(state, rider, null, car.pace);
      return true;
    }
  }
  for (const other of state.riders) {
    if (
      other !== rider &&
      other.mode === "riding" &&
      other.speed > WALKING_PACE &&
      overBody(rider, other.s, other.x, BIKE_HALF_LENGTH, BIKE_HALF_WIDTH)
    ) {
      other.speed *= 1 - RUN_OVER_SPEED_LOSS;
      state.events.push({ kind: "bump", rider: other.id });
      knockDown(state, rider, other, other.speed);
      return true;
    }
  }
  return false;
};

const over = (rider: RiderState, car: TrafficCar): boolean =>
  Math.abs(car.s - rider.s) < car.halfLength + BIKE_HALF_LENGTH &&
  Math.abs(car.x - rider.x) < car.halfWidth + BIKE_HALF_WIDTH;

const hasCleared = (rider: RiderState, car: TrafficCar): boolean =>
  (car.s - rider.s) * Math.sign(car.cruiseSpeed) >
  car.halfLength + BIKE_HALF_LENGTH;

const knockBike = (
  state: RaceState,
  rider: RiderState,
  car: TrafficCar
): void => {
  const off = clamp(
    (rider.x - car.x) / (car.halfWidth + BIKE_HALF_WIDTH),
    -1,
    1
  );
  const forward = Math.sign(car.cruiseSpeed);
  rider.speed =
    forward *
    Math.max(LEAST_BIKE_KNOCK, Math.abs(car.speed) * BIKE_KNOCK_SHARE) *
    (1 - Math.abs(off) / 2);
  rider.lateralSpeed = off * BIKE_KNOCK_ACROSS;
  damageRunOver(rider);
  state.events.push({ kind: "bump", rider: rider.id });
};

const runOverBike = (state: RaceState, rider: RiderState): void => {
  const under = state.cars[rider.runOverBy];
  if (under && !hasCleared(rider, under)) {
    return;
  }
  rider.runOverBy = -1;
  for (let index = 0; index < state.cars.length; index += 1) {
    const car = state.cars[index];
    if (
      car &&
      car.waited >= car.patience &&
      Math.abs(car.speed) > WALKING_PACE &&
      over(rider, car)
    ) {
      rider.runOverBy = index;
      knockBike(state, rider, car);
      return;
    }
  }
};

const lie = (state: RaceState, track: Track, rider: RiderState): void => {
  slideBike(track, rider);
  if (hitOnFoot(state, rider)) {
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

const towardBike = (rider: RiderState): Stride => {
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
  if (rider.runningToBike) {
    return towardBike(rider);
  }
  return {
    across: clamp(rider.staleSteer ? 0 : input.steer, -1, 1),
    along: clamp(
      (rider.staleThrottle ? 0 : input.throttle) -
        (rider.staleBrake ? 0 : input.brake),
      -1,
      1
    ),
  };
};

const run = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  input: RiderInput
): void => {
  slideBike(track, rider);
  if (hitOnFoot(state, rider)) {
    return;
  }
  rider.modeTicks += 1;
  if (rider.runningToBike && atTheBike(rider)) {
    rider.mode = "mounting";
    rider.modeTicks = 0;
    rider.speed = 0;
    rider.lateralSpeed = 0;
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

const mount = (state: RaceState, rider: RiderState): void => {
  rider.modeTicks += 1;
  rider.lean = approach(rider.lean, 0, 4 * TICK_SECONDS);
  rider.heading = 0;
  rider.lateralSpeed = 0;
  if (rider.modeTicks < MOUNT_TICKS) {
    return;
  }
  rider.mode = "riding";
  rider.modeTicks = 0;
  rider.runningToBike = false;
  rider.lean = 0;
  rider.heading = 0;
  rider.throttle = 0;
  rider.brake = 0;
  rider.stamina = Math.max(rider.stamina, REMOUNT_STAMINA);
  rearm(rider);
  state.events.push({ kind: "remount", rider: rider.id });
};

export const stepOffBike = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  input: RiderInput
): void => {
  releaseHeldInput(rider, input);
  rider.runningToBike ||= input.remount;
  if (
    rider.mode === "thrown" ||
    rider.mode === "lying" ||
    rider.mode === "running"
  ) {
    runOverBike(state, rider);
  }
  if (rider.mode === "wrecked") {
    comeToRest(track, rider);
  } else if (rider.mode === "thrown") {
    tumble(track, rider, input);
  } else if (rider.mode === "lying") {
    lie(state, track, rider);
  } else if (rider.mode === "running") {
    run(state, track, rider, input);
  } else if (rider.mode === "mounting") {
    mount(state, rider);
    rider.bodyS = rider.s;
    rider.bodyX = rider.x;
  }
};
