import {
  curvatureAt,
  firstSolidPropFrom,
  heightAt,
  slopeAt,
  slopeRateAt,
} from "@racer/track/track";
import type { Track } from "@racer/track/track";

import {
  approach,
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  GRAVITY,
  headingAssist,
  maxYawRate,
  MIN_STEER_SPEED,
  TICK_SECONDS,
} from "./state.ts";
import type {
  CrashCause,
  RaceState,
  RiderInput,
  RiderState,
  TrafficCar,
} from "./state.ts";

const ROAD_GRIP = 1.2;
const VERGE_GRIP = 0.55;
const VERGE_DRAG = 2.5;
const VERGE_DRAG_PER_SPEED = 0.09;
const TAKEOFF_SPEED = 10;
const HARD_LANDING = -11;
const GLANCE_OVERLAP = 0.3;
const CRASH_CLOSING_SPEED = 9;
const NEAR_MISS_MARGIN = 1.1;
const NEAR_MISS_CLOSING_SPEED = 12;
const PROP_CRASH_SPEED = 7;
const CLEARANCE_OVER_PROPS = 2;
const BODY_GROUND_DECELERATION = 14;
const BIKE_SLIDE_DECELERATION = 9;
const RUN_SPEED = 10;
const MOUNT_TICKS = 30;
const SETTLE_TICKS = 50;
const FINISH_BRAKE = 0.35;

const coasting: RiderInput = { brake: FINISH_BRAKE, steer: 0, throttle: 0 };

const forwardRateOf = (rider: RiderState, curvature: number): number =>
  (rider.speed * Math.cos(rider.heading)) /
  Math.max(0.5, 1 - curvature * rider.x);

const throwRider = (
  state: RaceState,
  riderIndex: number,
  cause: CrashCause,
  bikeKeep: number,
  bodyKeep: number
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  const impactSpeed = rider.speed;
  rider.mode = "thrown";
  rider.modeTicks = 0;
  rider.crashes += 1;
  rider.bodyS = rider.s;
  rider.bodyX = rider.x;
  rider.bodyAir = rider.air + 0.9;
  rider.bodySpeed = impactSpeed * bodyKeep;
  rider.bodyLateralSpeed = impactSpeed * Math.sin(rider.heading) * bodyKeep;
  rider.bodyVerticalSpeed =
    2 + impactSpeed * 0.05 + Math.max(0, rider.verticalSpeed);
  rider.speed = impactSpeed * bikeKeep;
  rider.airborne = false;
  rider.airTicks = 0;
  rider.verticalSpeed = 0;
  state.events.push({
    cause,
    kind: "crash",
    rider: riderIndex,
    speed: impactSpeed,
  });
};

const fly = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState
): void => {
  const curvature = curvatureAt(track, rider.s);
  const forwardRate = forwardRateOf(rider, curvature);
  const groundBefore = heightAt(track, rider.s);
  rider.heading -= curvature * forwardRate * TICK_SECONDS;
  rider.x += rider.speed * Math.sin(rider.heading) * TICK_SECONDS;
  rider.s += forwardRate * TICK_SECONDS;
  rider.air +=
    rider.verticalSpeed * TICK_SECONDS -
    (GRAVITY * TICK_SECONDS * TICK_SECONDS) / 2 -
    (heightAt(track, rider.s) - groundBefore);
  rider.verticalSpeed -= GRAVITY * TICK_SECONDS;
  rider.lean = approach(rider.lean, 0, 0.6 * TICK_SECONDS);
  rider.load = 0;
  rider.airTicks += 1;
  if (rider.air > 0) {
    return;
  }
  const impact = rider.verticalSpeed - slopeAt(track, rider.s) * forwardRate;
  const airSeconds = rider.airTicks * TICK_SECONDS;
  rider.air = 0;
  rider.airborne = false;
  rider.airTicks = 0;
  rider.verticalSpeed = 0;
  if (impact < HARD_LANDING) {
    throwRider(state, riderIndex, "landing", 0.7, 0.75);
    return;
  }
  rider.speed *= 1 - Math.min(0.15, Math.abs(impact) * 0.012);
  state.events.push({ airSeconds, impact, kind: "land", rider: riderIndex });
};

const ride = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  input: RiderInput
): void => {
  const { bike } = state;
  const curvature = curvatureAt(track, rider.s);
  const slope = slopeAt(track, rider.s);
  const forwardRate = forwardRateOf(rider, curvature);
  const verticalAcceleration =
    slopeRateAt(track, rider.s) * forwardRate * forwardRate;

  if (verticalAcceleration < -GRAVITY && rider.speed > TAKEOFF_SPEED) {
    rider.airborne = true;
    rider.verticalSpeed = slope * forwardRate;
    fly(state, track, riderIndex, rider);
    return;
  }

  rider.offRoad = Math.abs(rider.x) > track.roadHalfWidth;
  rider.load = clamp(1 + verticalAcceleration / GRAVITY, 0, 1.8);
  const grip = (rider.offRoad ? VERGE_GRIP : ROAD_GRIP) * rider.load;

  const steerSpeed = Math.max(rider.speed, MIN_STEER_SPEED);
  const commandedYawRate =
    input.steer * maxYawRate(bike, rider.speed) -
    headingAssist(bike, input.steer) * rider.heading;
  const leanLimit = Math.min(bike.maxLean, Math.atan(grip));
  const targetLean = clamp(
    Math.atan((commandedYawRate * steerSpeed) / GRAVITY),
    -leanLimit,
    leanLimit
  );
  rider.lean = approach(rider.lean, targetLean, bike.leanRate * TICK_SECONDS);
  const yawRate =
    ((GRAVITY * Math.tan(rider.lean)) / steerSpeed) *
    clamp(rider.speed / 2, 0, 1);
  const lateralAcceleration = yawRate * rider.speed;

  let acceleration =
    -bike.dragFactor * rider.speed * rider.speed -
    (GRAVITY * slope) / Math.hypot(1, slope);
  if (rider.speed > 0) {
    acceleration -= bike.rollingDeceleration;
  }
  if (input.throttle > 0) {
    acceleration +=
      input.throttle *
      Math.min(
        bike.launchAcceleration * Math.min(1, rider.load),
        bike.powerPerMass / Math.max(rider.speed, 1)
      );
  } else if (rider.speed > 0) {
    acceleration -= bike.engineBraking;
  }
  if (input.brake > 0) {
    const tractionLeft = Math.sqrt(
      Math.max(0, (grip * GRAVITY) ** 2 - lateralAcceleration ** 2)
    );
    acceleration -= Math.min(
      bike.brakeDeceleration * input.brake,
      tractionLeft
    );
  }
  if (rider.offRoad) {
    acceleration -= VERGE_DRAG + VERGE_DRAG_PER_SPEED * rider.speed;
  }
  rider.speed = Math.max(0, rider.speed + acceleration * TICK_SECONDS);

  rider.heading += (yawRate - curvature * forwardRate) * TICK_SECONDS;
  rider.x += rider.speed * Math.sin(rider.heading) * TICK_SECONDS;
  rider.s += forwardRate * TICK_SECONDS;
};

const hitProps = (
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
        throwRider(state, riderIndex, "prop", 0.15, 0.45);
        return true;
      }
      rider.x -= Math.sign(prop.x) * 0.06;
      rider.speed = Math.min(rider.speed, 3);
    }
  }
  return false;
};

const hitCar = (
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
    rider.heading += awayFromCar * 0.05;
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
    rider.speed = Math.max(0, Math.min(rider.speed, car.speed) - 1);
    rider.s = car.s - reachS;
  } else {
    rider.speed = Math.max(rider.speed, car.speed + 1);
  }
  state.events.push({ kind: "bump", rider: riderIndex });
  return false;
};

const tumble = (track: Track, rider: RiderState): void => {
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
  rider.s += rider.speed * Math.cos(rider.heading) * TICK_SECONDS;
  rider.x = clamp(
    rider.x + rider.speed * Math.sin(rider.heading) * TICK_SECONDS,
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
  if (settled && rider.modeTicks > SETTLE_TICKS) {
    rider.mode = "running";
    rider.modeTicks = 0;
    rider.speed = 0;
    rider.bodySpeed = 0;
  }
};

const runToBike = (rider: RiderState): void => {
  rider.modeTicks += 1;
  const gapS = rider.s - rider.bodyS;
  const gapX = rider.x - rider.bodyX;
  const distance = Math.hypot(gapS, gapX);
  if (distance < 0.7) {
    rider.mode = "mounting";
    rider.modeTicks = 0;
    return;
  }
  const stride = Math.min(distance, RUN_SPEED * TICK_SECONDS);
  rider.bodyS += (gapS / distance) * stride;
  rider.bodyX += (gapX / distance) * stride;
};

const mount = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState
): void => {
  rider.modeTicks += 1;
  rider.lean = approach(rider.lean, 0, 4 * TICK_SECONDS);
  rider.heading = approach(rider.heading, 0, 2 * TICK_SECONDS);
  if (rider.modeTicks < MOUNT_TICKS) {
    return;
  }
  rider.mode = "riding";
  rider.modeTicks = 0;
  rider.lean = 0;
  rider.heading = 0;
  state.events.push({ kind: "remount", rider: riderIndex });
};

export const stepRider = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  input: RiderInput
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  if (rider.mode === "thrown") {
    tumble(track, rider);
    return;
  }
  if (rider.mode === "running") {
    runToBike(rider);
    return;
  }
  if (rider.mode === "mounting") {
    mount(state, riderIndex, rider);
    rider.bodyS = rider.s;
    rider.bodyX = rider.x;
    return;
  }

  rider.modeTicks += 1;
  if (rider.airborne) {
    fly(state, track, riderIndex, rider);
  } else {
    ride(
      state,
      track,
      riderIndex,
      rider,
      rider.finishTick < 0 ? input : coasting
    );
  }

  let thrown = rider.mode !== "riding";
  if (!thrown && Math.abs(rider.x) > track.vergeHalfWidth) {
    rider.x = clamp(rider.x, -track.vergeHalfWidth, track.vergeHalfWidth);
    throwRider(state, riderIndex, "offTrack", 0.3, 0.5);
    thrown = true;
  }
  if (!thrown) {
    thrown = hitProps(state, track, riderIndex, rider);
  }
  for (const car of state.cars) {
    if (thrown) {
      break;
    }
    if (Math.abs(car.s - rider.s) < 12) {
      thrown = hitCar(state, riderIndex, rider, car);
    }
  }
  if (thrown) {
    return;
  }

  rider.bodyS = rider.s;
  rider.bodyX = rider.x;
  rider.bodyAir = rider.air;
  if (rider.finishTick < 0 && rider.s >= track.length) {
    rider.finishTick = state.tick;
    state.events.push({ kind: "finish", rider: riderIndex, tick: state.tick });
  }
};
