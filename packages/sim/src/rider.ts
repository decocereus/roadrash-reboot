import {
  crossRamps,
  deckHeightOf,
  deckSlopeOf,
  emptyCrossing,
  emptySupport,
  lipOf,
  lipSlopeOf,
  supportAt,
} from "@racer/track/features";
import type { Crossing, Support, TrackFeature } from "@racer/track/features";
import {
  curvatureAt,
  firstSolidPropFrom,
  heightAt,
  slopeAt,
  slopeRateAt,
} from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { CONTROL_RAMP, dragOf, stepDrive } from "./engine.ts";
import { pullOver } from "./police.ts";
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
  CrashCause,
  RaceState,
  RiderInput,
  RiderState,
  TrafficCar,
} from "./state.ts";
import { disarm, rearm, weapons } from "./weapons.ts";

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
const TAKEOFF_SPEED = 10;
export const HARD_LANDING = -11;
export const LANDING_SLIP = 0.6;
const JUDGED_FLIGHT_TICKS = 15;
const LANDING_LOSS_PER_IMPACT = 0.008;
const MOST_LANDING_LOSS = 0.1;
const WOBBLE_PER_IMPACT = 1 / 12;
const WOBBLE_DECAY = 1.1;
const WOBBLE_TURNS = 20;
const WOBBLE_SWAY = 0.8;
const WOBBLE_LEAN = 0.35;
const WOBBLE_GRIP = 0.4;
const DECK_STEP = 0.1;
const WALL_SPEED_KEEP = 0.98;
const WALL_THROW_HEIGHT = 0.2;
const WALL_THROW_SPEED = 1;
const GLANCE_OVERLAP = 0.3;
const CRASH_CLOSING_SPEED = 9;
const NEAR_MISS_MARGIN = 1.1;
const NEAR_MISS_CLOSING_SPEED = 12;
const PROP_CRASH_SPEED = 7;
const CLEARANCE_OVER_PROPS = 2;
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
const FINISH_BRAKE = 0.35;
const REMOUNT_STAMINA = 55;
const STUN_STEER = 0.65;
const VERGE_STEER = 0.8;
const VERGE_BLEND = 0.75;
const BRAKE_RESERVE = 0.35;
const SIDESTEP_SPEED = 3;
const STEERING_AWAY = 0.5;
const DAMAGE_SPEED = 200 / 3.6;
const LEAST_DAMAGE = 0.1;
const MOST_DAMAGE = 1.25;
const BLAME_TICKS = 60;

const damage = {
  combat: 28,
  landing: 30,
  offTrack: 22,
  prop: 32,
  rider: 30,
  traffic: 34,
} as const satisfies Record<CrashCause, number>;

const coasting: RiderInput = {
  brake: FINISH_BRAKE,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
};

const standing: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
};

const forwardRateOf = (rider: RiderState, curvature: number): number =>
  rider.speed / Math.max(0.5, 1 - curvature * rider.x);

const swayOf = (rider: RiderState): number =>
  rider.wobble * Math.sin(rider.wobble * WOBBLE_TURNS);

const settleVisuals = (rider: RiderState, authority: number): void => {
  const limit = Math.max(1, lateralSpeedLimit(rider.bike, rider.speed));
  rider.lean =
    (clamp(rider.lateralSpeed / limit, -1, 1) * authority +
      swayOf(rider) * WOBBLE_LEAN) *
    rider.bike.visualLean;
  rider.heading =
    Math.atan2(rider.lateralSpeed, Math.max(rider.speed, 6)) * 0.5;
};

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

const blamedFor = (state: RaceState, rider: RiderState): number =>
  rider.lastHitBy >= 0 && state.tick - rider.lastHitTick <= BLAME_TICKS
    ? rider.lastHitBy
    : -1;

const takesDamage = (rider: RiderState): boolean =>
  rider.profile.role === "racer" && rider.finishTick < 0;

export const throwRider = (
  state: RaceState,
  riderIndex: number,
  cause: CrashCause,
  bikeKeep: number,
  bodyKeep: number,
  speedAtImpact?: number
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  const impactSpeed = rider.speed;
  const struckAt = speedAtImpact ?? impactSpeed;
  if (takesDamage(rider)) {
    rider.condition = Math.max(
      0,
      rider.condition -
        damage[cause] *
          clamp(struckAt / DAMAGE_SPEED, LEAST_DAMAGE, MOST_DAMAGE)
    );
  }
  const wrecked = rider.condition <= 0;
  rider.mode = wrecked ? "wrecked" : "thrown";
  rider.weaponAtThrow = rider.weapon;
  disarm(rider);
  rider.chase = -1;
  rider.parked = false;
  rider.attack = "none";
  rider.attackTicks = 0;
  rider.hitStun = 0;
  rider.tuck = 0;
  rider.tuckTicks = 0;
  rider.modeTicks = 0;
  rider.crashes += 1;
  rider.staleThrottle = true;
  rider.staleBrake = true;
  rider.staleSteer = true;
  rider.idleTicks = 0;
  rider.bodyS = rider.s;
  rider.bodyX = rider.x;
  rider.bodyAir = rider.air + 0.9;
  rider.bodySpeed = impactSpeed * bodyKeep;
  rider.bodyLateralSpeed = rider.lateralSpeed * bodyKeep;
  rider.bodyVerticalSpeed =
    2 + impactSpeed * 0.05 + Math.max(0, rider.verticalSpeed);
  rider.speed = impactSpeed * bikeKeep;
  rider.airborne = false;
  rider.airTicks = 0;
  rider.verticalSpeed = 0;
  rider.wobble = 0;
  state.events.push({
    by: blamedFor(state, rider),
    cause,
    kind: "crash",
    rider: riderIndex,
    speed: struckAt,
  });
  if (wrecked) {
    state.events.push({ kind: "wrecked", rider: riderIndex });
  }
};

const before: Support = emptySupport();
const under: Support = emptySupport();
const crossing: Crossing = emptyCrossing();

interface Contact {
  readonly x: number;
  readonly slope: number;
  readonly verticalSpeed: number;
}

const land = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  contact: Contact,
  forwardRate: number
): void => {
  const impact = contact.verticalSpeed - contact.slope * forwardRate;
  const judged = rider.airTicks >= JUDGED_FLIGHT_TICKS;
  const airSeconds = rider.airTicks * TICK_SECONDS;
  const slip =
    Math.abs(rider.lateralSpeed) /
    Math.max(1, lateralSpeedLimit(rider.bike, rider.speed));
  rider.air = under.height;
  rider.airborne = false;
  rider.airTicks = 0;
  rider.verticalSpeed = 0;
  rider.offRoad = Math.abs(contact.x) > track.roadHalfWidth;
  if (
    impact < HARD_LANDING ||
    (judged && (rider.offRoad || slip > LANDING_SLIP))
  ) {
    throwRider(state, riderIndex, "landing", 0.7, 0.75);
    return;
  }
  rider.speed *=
    1 - Math.min(MOST_LANDING_LOSS, -impact * LANDING_LOSS_PER_IMPACT);
  rider.wobble = clamp(-impact * WOBBLE_PER_IMPACT + slip, 0, 1);
  state.events.push({ airSeconds, impact, kind: "land", rider: riderIndex });
};

const glancesOff = (
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

const launchFromLip = (
  track: Track,
  rider: RiderState,
  jump: TrackFeature,
  forwardRate: number
): void => {
  const lip = lipOf(jump);
  const seconds = (rider.s - lip) / Math.max(1, forwardRate);
  const climb = lipSlopeOf(jump) * forwardRate;
  rider.airborne = true;
  rider.airTicks = 0;
  rider.air = jump.rise + climb * seconds - (GRAVITY * seconds * seconds) / 2;
  rider.verticalSpeed =
    slopeAt(track, lip) * forwardRate + climb - GRAVITY * seconds;
};

const settleOnSurface = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  fromS: number,
  fromX: number,
  forwardRate: number
): void => {
  crossRamps(track, fromS, fromX, rider.s, rider.x, crossing);
  const jump = track.features[crossing.feature];
  if (!jump) {
    rider.air = 0;
    return;
  }
  const alongS = rider.s - fromS;
  if (crossing.enter > 0 && crossing.enterSide) {
    const height = deckHeightOf(jump, fromS + alongS * crossing.enter);
    if (height > rider.air + DECK_STEP) {
      if (glancesOff(state, riderIndex, rider, height, fromX)) {
        rider.air = 0;
      }
      return;
    }
  }
  if (crossing.leave >= 1) {
    rider.air = deckHeightOf(jump, rider.s);
    return;
  }
  if (!crossing.leaveSide && rider.s > lipOf(jump)) {
    launchFromLip(track, rider, jump, forwardRate);
    return;
  }
  const leftAt = fromS + alongS * crossing.leave;
  const height = deckHeightOf(jump, leftAt);
  if (!crossing.leaveSide || height <= DECK_STEP) {
    rider.air = 0;
    return;
  }
  rider.airborne = true;
  rider.airTicks = 0;
  rider.air = height;
  rider.verticalSpeed =
    (slopeAt(track, leftAt) + deckSlopeOf(jump, leftAt)) * forwardRate;
};

const flightOverDeck = { constant: 0, linear: 0, squared: 0 };

const traceOverDeck = (
  jump: TrackFeature,
  fromS: number,
  alongS: number,
  air: number,
  rise: number,
  drop: number
): void => {
  const start = (fromS - jump.s) / jump.length;
  const along = alongS / jump.length;
  flightOverDeck.squared =
    -(GRAVITY * TICK_SECONDS * TICK_SECONDS) / 2 - jump.rise * along * along;
  flightOverDeck.linear =
    rise * TICK_SECONDS - drop - 2 * jump.rise * start * along;
  flightOverDeck.constant = air - jump.rise * start * start;
};

const clearanceAt = (share: number): number =>
  (flightOverDeck.squared * share + flightOverDeck.linear) * share +
  flightOverDeck.constant;

const firstTouch = (from: number, to: number): number => {
  if (clearanceAt(from) <= 0) {
    return from;
  }
  if (clearanceAt(to) > 0) {
    return -1;
  }
  const { constant, linear, squared } = flightOverDeck;
  const discriminant = Math.max(0, linear * linear - 4 * squared * constant);
  return clamp((-linear - Math.sqrt(discriminant)) / (2 * squared), from, to);
};

const touchDeck = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  share: number,
  fromS: number,
  fromX: number,
  rise: number,
  forwardRate: number
): void => {
  const toS = rider.s;
  const toX = rider.x;
  const s = fromS + (toS - fromS) * share;
  const x = fromX + (toX - fromX) * share;
  rider.s = s;
  rider.x = x;
  supportAt(track, s, x, under);
  land(
    state,
    track,
    riderIndex,
    rider,
    {
      slope: slopeAt(track, s) + under.slope,
      verticalSpeed: rise - GRAVITY * TICK_SECONDS * share,
      x,
    },
    forwardRate
  );
  if (rider.mode !== "riding") {
    return;
  }
  rider.s = toS;
  rider.x = toX;
  settleOnSurface(state, track, riderIndex, rider, s, x, forwardRate);
};

const fly = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState
): void => {
  const fromS = rider.s;
  const fromX = rider.x;
  const fromAir = rider.air;
  const rise = rider.verticalSpeed;
  const curvature = curvatureAt(track, rider.s);
  const forwardRate = forwardRateOf(rider, curvature);
  const groundBefore = heightAt(track, rider.s);
  const push = curvePushOf(rider.bike, curvature, rider.speed);
  rider.x += (rider.lateralSpeed - push) * TICK_SECONDS;
  rider.s += forwardRate * TICK_SECONDS;
  const drop = heightAt(track, rider.s) - groundBefore;
  rider.air +=
    rise * TICK_SECONDS - (GRAVITY * TICK_SECONDS * TICK_SECONDS) / 2 - drop;
  rider.verticalSpeed -= GRAVITY * TICK_SECONDS;
  settleVisuals(rider, 0.6);
  rider.load = 0;
  rider.airTicks += 1;
  crossRamps(track, fromS, fromX, rider.s, rider.x, crossing);
  const jump = track.features[crossing.feature];
  if (jump) {
    const entry = Math.max(0, crossing.enter);
    traceOverDeck(jump, fromS, rider.s - fromS, fromAir, rise, drop);
    const intoSide = crossing.enter > 0 && crossing.enterSide;
    const below = -clearanceAt(entry);
    if (intoSide && below > DECK_STEP) {
      if (!glancesOff(state, riderIndex, rider, below, fromX)) {
        return;
      }
    } else {
      const share = firstTouch(entry, Math.min(1, crossing.leave));
      if (share >= 0) {
        touchDeck(
          state,
          track,
          riderIndex,
          rider,
          share,
          fromS,
          fromX,
          rise,
          forwardRate
        );
        return;
      }
    }
  }
  if (rider.air > 0) {
    return;
  }
  const share = clamp(fromAir / (fromAir - rider.air), 0, 1);
  const contactS = fromS + (rider.s - fromS) * share;
  supportAt(track, rider.s, rider.x, under);
  land(
    state,
    track,
    riderIndex,
    rider,
    {
      slope: slopeAt(track, contactS),
      verticalSpeed: rise - GRAVITY * TICK_SECONDS * share,
      x: fromX + (rider.x - fromX) * share,
    },
    forwardRate
  );
};

const ride = (
  state: RaceState,
  track: Track,
  riderIndex: number,
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
    fly(state, track, riderIndex, rider);
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
  const limit =
    lateralSpeedLimit(bike, rider.speed, input.throttle) *
    (1 - (1 - VERGE_STEER) * verge) *
    (1 - WOBBLE_GRIP * rider.wobble);
  const wantedLateral =
    input.steer * limit * (rider.hitStun > 0 ? STUN_STEER : 1);
  rider.lateralSpeed = approach(
    rider.lateralSpeed,
    wantedLateral,
    bike.steerRate * weapons[rider.weapon].steerFactor * TICK_SECONDS
  );
  const lock = clamp(Math.abs(rider.lateralSpeed) / Math.max(1, limit), 0, 1);
  const push = curvePushOf(bike, curvature, rider.speed);

  settleIntoTuck(rider, input, lock);
  const pull = stepDrive(bike, rider, rider.speed, rider.throttle);

  let acceleration =
    -(GRAVITY * slope) / Math.hypot(1, slope) -
    bike.leanScrub * lock * lock * rider.speed;
  if (rider.speed > 0) {
    acceleration -=
      dragOf(bike, rider.speed, rider.tuck) +
      bike.engineBraking * (1 - rider.throttle) * Math.min(1, rider.revs);
  }
  acceleration += Math.min(
    bike.launchAcceleration * Math.min(1, rider.load) * rider.throttle,
    pull
  );
  acceleration -=
    bike.brakeDeceleration *
    rider.brake *
    (1 - (1 - VERGE_BRAKES) * verge) *
    Math.min(1, rider.load) *
    (1 - (1 - BRAKE_RESERVE) * lock);
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
  settleOnSurface(state, track, riderIndex, rider, fromS, fromX, forwardRate);
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
  Math.hypot(rider.s - rider.bodyS, rider.x - rider.bodyX) < MOUNT_REACH;

interface Stride {
  readonly along: number;
  readonly across: number;
}

export const towardBike = (rider: RiderState): Stride => {
  const gapS = rider.s - rider.bodyS;
  const gapX = rider.x - rider.bodyX;
  const distance = Math.max(1e-6, Math.hypot(gapS, gapX));
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
  const effort = Math.max(1, Math.hypot(along, across));
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
    track.length
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

const stepOffBike = (
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
  if (rider.mode !== "riding") {
    stepOffBike(
      state,
      track,
      riderIndex,
      rider,
      rider.finishTick < 0 ? input : standing
    );
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

  if (rider.stamina <= 0) {
    throwRider(state, riderIndex, "combat", 0.6, 0.65);
    return;
  }
  rider.bodyS = rider.s;
  rider.bodyX = rider.x;
  rider.bodyAir = rider.air;
  if (
    rider.finishTick < 0 &&
    rider.s >= track.length &&
    rider.profile.role === "racer"
  ) {
    rider.finishTick = state.tick;
    state.events.push({ kind: "finish", rider: riderIndex, tick: state.tick });
  }
};
