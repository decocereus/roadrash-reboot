import { emptySupport, supportAt } from "@racer/track/features";
import type { Support } from "@racer/track/features";
import { hypot2, sin } from "@racer/track/math";
import { curvatureAt, slopeAt, slopeRateAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { CONTROL_RAMP, dragOf, stepDrive } from "./engine.ts";
import { throwRider } from "./rider-crash.ts";
import {
  belowDeck,
  fly,
  forwardRateOf,
  settleOnSurface,
  settleVisuals,
  swayOf,
} from "./rider-flight.ts";
import {
  approach,
  clamp,
  curvePushOf,
  GRAVITY,
  lateralFor,
  lateralSpeedLimit,
  TICK_SECONDS,
} from "./state.ts";
import type { RaceState, RiderInput, RiderState } from "./state.ts";
import { weapons } from "./weapons.ts";

const VERGE_BRAKES = 0.45;
const VERGE_DRAG = 1.5;
const VERGE_DRAG_PER_SPEED = 0.09;
const TUCK_THROTTLE = 0.8;
const TUCK_STEER = 0.3;
const TUCK_SPEED = 120 / 3.6;
const TUCK_HOLD_SPEED = 95 / 3.6;
const TUCK_SETTLE_TICKS = 90;
const TUCK_STEER_COST = 0.25;
const TUCK_IN_RATE = 1;
const TUCK_OUT_RATE = 5;
const HARD_BRAKE = 0.5;
export const TAKEOFF_SPEED = 10;
const WOBBLE_DECAY = 1.1;
const WOBBLE_SWAY = 0.8;
const WOBBLE_GRIP = 0.4;
const STUN_STEER = 0.65;
const VERGE_STEER = 0.8;
const VERGE_BLEND = 0.75;
export const BRAKE_RESERVE = 0.35;
export const SLIP_RECOVERY = 1;
export const SLIP_PUSH = 1;
const SLIP_BRAKES = 0.7;
const SLIP_DRIVE = 0.6;
const SLIDE_SLIP = 0.5;
const SLIDE_SPEED = 26;
const SLIDE_STEER = 0.8;
const SLIDE_TICKS = 18;
const SLIDE_YAW = 0.22;
const SLIDE_SWING = 0.35;

const settleIntoTuck = (
  rider: RiderState,
  input: RiderInput,
  lock: number
): void => {
  const calm =
    rider.attack === "none" &&
    rider.hitStun === 0 &&
    !rider.offRoad &&
    input.brake < HARD_BRAKE;
  const settling =
    calm &&
    input.throttle > TUCK_THROTTLE &&
    input.brake === 0 &&
    lock < TUCK_STEER &&
    rider.speed > TUCK_SPEED;
  const holding =
    calm &&
    rider.tuckTicks >= TUCK_SETTLE_TICKS &&
    rider.speed > TUCK_HOLD_SPEED;
  rider.tuckTicks =
    settling || holding ? Math.min(TUCK_SETTLE_TICKS, rider.tuckTicks + 1) : 0;
  const wanted =
    rider.tuckTicks >= TUCK_SETTLE_TICKS ? 1 - TUCK_STEER_COST * lock : 0;
  rider.tuck = approach(
    rider.tuck,
    wanted,
    (wanted > 0 ? TUCK_IN_RATE : TUCK_OUT_RATE) * TICK_SECONDS
  );
};

const before: Support = emptySupport();

const losesTheFront = (
  state: RaceState,
  rider: RiderState,
  input: RiderInput
): boolean => {
  const asking =
    rider.slip > SLIDE_SLIP &&
    rider.speed > SLIDE_SPEED &&
    Math.abs(input.steer) >= SLIDE_STEER;
  rider.slipTicks = asking ? rider.slipTicks + 1 : 0;
  if (rider.slipTicks < SLIDE_TICKS) {
    return false;
  }
  throwRider(
    state,
    rider,
    "hazard",
    0.55,
    0.65,
    undefined,
    state.hazards[rider.slipFrom] ?? null
  );
  return true;
};

export const ride = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  input: RiderInput
): void => {
  const { bike } = rider;
  supportAt(track, rider.s, rider.x, before);
  const curvature = curvatureAt(track, rider.s);
  const slope = slopeAt(track, rider.s) + before.slope;
  const forwardRate = forwardRateOf(rider, curvature);
  const verticalAcceleration =
    (slopeRateAt(track, rider.s) + before.slopeRate) *
    forwardRate *
    forwardRate;

  if (verticalAcceleration < -GRAVITY && rider.speed > TAKEOFF_SPEED) {
    rider.airborne = true;
    rider.verticalSpeed = slope * forwardRate;
    fly(state, track, rider);
    return;
  }

  rider.offRoad = Math.abs(rider.x) > track.roadHalfWidth;
  rider.load = clamp(1 + verticalAcceleration / GRAVITY, 0, 1.8);
  const verge = clamp(
    (Math.abs(rider.x) - track.roadHalfWidth) / VERGE_BLEND,
    0,
    1
  );
  rider.throttle = approach(
    rider.throttle,
    input.throttle,
    CONTROL_RAMP * TICK_SECONDS
  );
  rider.brake = approach(rider.brake, input.brake, CONTROL_RAMP * TICK_SECONDS);

  rider.wobble = Math.max(0, rider.wobble - WOBBLE_DECAY * TICK_SECONDS);
  rider.slip = Math.max(0, rider.slip - SLIP_RECOVERY * TICK_SECONDS);
  const grip = 1 - rider.slip;
  const limit =
    lateralSpeedLimit(bike, rider.speed, input.throttle) *
    (1 - (1 - VERGE_STEER) * verge) *
    (1 - WOBBLE_GRIP * rider.wobble);
  const bendPush = curvePushOf(bike, curvature, rider.speed);
  const wantedLateral = lateralFor(
    input.steer,
    bendPush,
    limit,
    rider.hitStun > 0 ? STUN_STEER : 1
  );
  rider.lateralSpeed = approach(
    rider.lateralSpeed,
    wantedLateral,
    bike.steerRate * weapons[rider.weapon].steerFactor * grip * TICK_SECONDS
  );
  const lock = clamp(Math.abs(rider.lateralSpeed) / Math.max(1, limit), 0, 1);
  const push = bendPush * (1 + SLIP_PUSH * rider.slip);
  if (losesTheFront(state, rider, input)) {
    return;
  }

  settleIntoTuck(rider, input, lock);
  const pull = stepDrive(bike, rider, rider.speed, rider.throttle);

  let acceleration =
    -(GRAVITY * slope) / hypot2(1, slope) -
    bike.leanScrub * lock * lock * rider.speed;
  if (rider.speed > 0) {
    acceleration -=
      dragOf(bike, rider.speed, rider.tuck) +
      bike.engineBraking * (1 - rider.throttle) * Math.min(1, rider.revs);
  }
  acceleration +=
    Math.min(
      bike.launchAcceleration * Math.min(1, rider.load) * rider.throttle,
      pull
    ) *
    (1 - SLIP_DRIVE * rider.slip);
  acceleration -=
    bike.brakeDeceleration *
    rider.brake *
    (1 - (1 - VERGE_BRAKES) * verge) *
    Math.min(1, rider.load) *
    (1 - (1 - BRAKE_RESERVE) * lock) *
    (1 - SLIP_BRAKES * rider.slip);
  if (rider.offRoad) {
    acceleration -= VERGE_DRAG + VERGE_DRAG_PER_SPEED * rider.speed;
  }
  rider.speed = Math.max(0, rider.speed + acceleration * TICK_SECONDS);

  const fromS = rider.s;
  const fromX = rider.x;
  rider.x +=
    (rider.lateralSpeed - push + swayOf(rider) * WOBBLE_SWAY) * TICK_SECONDS;
  rider.s += forwardRate * TICK_SECONDS;
  settleVisuals(rider, 1);
  rider.heading += rider.slip * SLIDE_YAW * sin(rider.modeTicks * SLIDE_SWING);
  settleOnSurface(
    state,
    track,
    rider,
    fromS,
    fromX,
    !belowDeck(before.height, rider.air),
    forwardRate
  );
};
