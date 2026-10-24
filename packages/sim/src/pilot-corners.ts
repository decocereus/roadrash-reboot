import {
  FASTEST_LAUNCH,
  flatFlightLength,
  lipOf,
  lipSlopeOf,
  nextJumpFrom,
} from "@racer/track/features";
import type { TrackFeature } from "@racer/track/features";
import { hypot2 } from "@racer/track/math";
import {
  curvatureAt,
  heightAt,
  slopeAt,
  slopeRateAt,
} from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { dragOf } from "./engine.ts";
import { CORNER_SCAN_POINTS } from "./pilot-history.ts";
import { BRAKE_RESERVE, TAKEOFF_SPEED } from "./rider-drive.ts";
import { HARD_LANDING, LANDING_SLIP } from "./rider-flight.ts";
import {
  BIKE_HALF_WIDTH,
  clamp,
  curvePushOf,
  GRAVITY,
  lateralSpeedLimit,
} from "./state.ts";
import type { BikeSpec, PilotHistory, RiderState } from "./state.ts";
import { weapons } from "./weapons.ts";

export const CORNER_MARGIN = 0.99;
const CORNER_MARGIN_PER_LACK = 0.3;
const CORNER_SCAN_STEP = 5;
const SCAN_BRAKING_SHARE = 0.5;
const MIN_BEND = 1e-5;
export const BRAKE_SHARE = 0.9;
const BRAKE_LAG_SECONDS = 0.15;
const BRAKE_PER_EXCESS = 4;
const LEAD_STEPS = 12;
const LIFT_DROP = 0.05;
const RESERVE_SHARE = 0.3;
const LAUNCH_SEARCH_STEPS = 10;
const CREST_FLIGHT_STEP = 4;
const LONGEST_CREST_FLIGHT = 200;
const CREST_MARGIN = 1.15;
export const PLANNED_BRAKING = 6.5;
const PLANNED_LIFT = 3.5;
const SCAN_STEP = 10;
export const LANE_CHANGE_RATE = 1.2;
export const MAX_LATERAL_SPEED = 5;
export const JUMP_LANDING_ROOM = 0.5;
const JUMP_IMPACT_MARGIN = 0.9;
export const JUMP_WALL_CLEARANCE = 1.2;
export const OIL_RECOVERY_SECONDS = 0.6;

export const riding = { brakeShare: BRAKE_SHARE, margin: 1 };

const holdingSpeed = (bike: BikeSpec, bend: number, grip: number): number => {
  const push = bend / bike.curvePush;
  const held = bike.lateralSpeedPerSpeed * grip;
  return (
    (held + Math.sqrt(held * held + 4 * push * bike.lateralSpeed * grip)) /
    (2 * push)
  );
};

const lockOf = (bike: BikeSpec, lateralSpeed: number, speed: number): number =>
  clamp(
    Math.abs(lateralSpeed) / Math.max(1, lateralSpeedLimit(bike, speed)),
    0,
    1
  );

const brakingOn = (
  rider: RiderState,
  drop: number,
  speed: number,
  lock: number
): number =>
  rider.bike.brakeDeceleration *
  (1 - (1 - BRAKE_RESERVE) * lock) *
  clamp(1 + (drop * speed * speed) / GRAVITY, 0, 1);

const resistanceOn = (
  rider: RiderState,
  slope: number,
  speed: number,
  lock: number
): number => {
  const { bike } = rider;
  return (
    dragOf(bike, speed, rider.tuck) +
    bike.engineBraking * Math.min(1, rider.revs) +
    bike.leanScrub * lock * lock * speed +
    (GRAVITY * slope) / hypot2(1, slope)
  );
};

interface Deceleration {
  braking: number;
  capacity: number;
  lag: number;
  resisting: number;
}

export const deceleration: Deceleration = {
  braking: 0,
  capacity: 0,
  lag: 0,
  resisting: 0,
};

export const measureDeceleration = (
  track: Track,
  rider: RiderState
): Deceleration => {
  const { bike, speed } = rider;
  const lock = lockOf(bike, rider.lateralSpeed, speed);
  deceleration.braking = brakingOn(
    rider,
    slopeRateAt(track, rider.s),
    speed,
    lock
  );
  deceleration.resisting = resistanceOn(
    rider,
    slopeAt(track, rider.s),
    speed,
    lock
  );
  deceleration.capacity = deceleration.braking + deceleration.resisting;
  deceleration.lag = speed * BRAKE_LAG_SECONDS;
  return deceleration;
};

export const neededToSlow = (
  speed: number,
  target: number,
  metres: number
): number =>
  (speed * speed - target * target) /
  (2 * Math.max(metres - deceleration.lag, deceleration.lag));

export const cornerMargin = (skill: number): number =>
  CORNER_MARGIN - CORNER_MARGIN_PER_LACK * (1 - skill);

export const crestSpeedLimit = (track: Track, rider: RiderState): number => {
  const horizon = (rider.speed * rider.speed) / (2 * PLANNED_LIFT) + 40;
  let limit = Number.POSITIVE_INFINITY;
  for (let ahead = 0; ahead < horizon; ahead += SCAN_STEP) {
    const drop = slopeRateAt(track, rider.s + ahead);
    if (drop < 0) {
      const crest = Math.sqrt(-GRAVITY / drop) * CREST_MARGIN;
      limit = Math.min(
        limit,
        Math.sqrt(crest * crest + 2 * PLANNED_LIFT * ahead)
      );
    }
  }
  return limit;
};

const runsWide = (track: Track, rider: RiderState): boolean => {
  const { bike, speed } = rider;
  const push = curvePushOf(bike, curvatureAt(track, rider.s), speed);
  const outward = -Math.sign(push);
  const drift = (rider.lateralSpeed - push) * outward;
  if (drift <= 0) {
    return false;
  }
  const room = Math.max(
    0,
    track.roadHalfWidth - BIKE_HALF_WIDTH - rider.x * outward
  );
  return (
    Math.abs(push) > lateralSpeedLimit(bike, speed) ||
    drift * drift > 2 * bike.steerRate * room
  );
};

export const askedLateral = (
  track: Track,
  rider: RiderState,
  line: number
): number => {
  const push = curvePushOf(
    rider.bike,
    curvatureAt(track, rider.s),
    rider.speed
  );
  const drift = rider.lateralSpeed - push;
  const settling = (drift * Math.abs(drift)) / (2 * rider.bike.steerRate);
  return clamp(
    (line - rider.x - settling) * LANE_CHANGE_RATE,
    -MAX_LATERAL_SPEED,
    MAX_LATERAL_SPEED
  );
};

export interface Slick {
  metres: number;
  speed: number;
}

const noSlick: Slick = {
  metres: Number.POSITIVE_INFINITY,
  speed: Number.POSITIVE_INFINITY,
};

const ceilings = new Float64Array(CORNER_SCAN_POINTS);
const coasted = new Float64Array(CORNER_SCAN_POINTS);
const bends = new Float64Array(CORNER_SCAN_POINTS);
const slopes = new Float64Array(CORNER_SCAN_POINTS);
const drops = new Float64Array(CORNER_SCAN_POINTS);
export const paced = new Float64Array(CORNER_SCAN_POINTS);
export const plan = { count: 0, lowest: Number.POSITIVE_INFINITY, paced: 0 };

export const sampleOf = (
  values: Float64Array,
  count: number,
  ahead: number
): number => {
  if (count <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const position = clamp(ahead / CORNER_SCAN_STEP, 0, count - 1);
  const index = Math.min(count - 1, Math.floor(position));
  const from = values[index] ?? Number.POSITIVE_INFINITY;
  const to = values[Math.min(count - 1, index + 1)] ?? from;
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return Math.min(from, to);
  }
  return from + (to - from) * (position - index);
};

const slowedFrom = (
  rider: RiderState,
  index: number,
  next: number,
  share: number
): number => {
  if (!Number.isFinite(next)) {
    return next;
  }
  const { bike } = rider;
  const lock = clamp(
    curvePushOf(bike, bends[index] ?? 0, next) /
      Math.max(1, lateralSpeedLimit(bike, next)),
    0,
    1
  );
  const slowing =
    share * brakingOn(rider, drops[index] ?? 0, next, lock) +
    resistanceOn(rider, slopes[index] ?? 0, next, lock);
  return Math.sqrt(Math.max(0, next * next + 2 * slowing * CORNER_SCAN_STEP));
};

const rampAhead = (
  track: Track,
  rider: RiderState,
  line: number,
  reach: number
): TrackFeature | undefined => {
  const jump = track.features[nextJumpFrom(track, rider.s)];
  if (!jump) {
    return undefined;
  }
  const lip = lipOf(jump) - rider.s;
  const taken = Math.abs(line - jump.x) < jump.width / 2 + BIKE_HALF_WIDTH;
  return taken && lip >= 0 && lip <= reach ? jump : undefined;
};

const landsAfterFlight = (
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  from: number,
  flight: number,
  x: number,
  speed: number,
  margin: number
): boolean => {
  const { bike } = rider;
  if (speed > sampleOf(history.braked, plan.count, from + flight - rider.s)) {
    return false;
  }
  const takeoff = curvatureAt(track, from);
  let bendAcross = 0;
  for (let s = from; s < from + flight; s += CORNER_SCAN_STEP) {
    bendAcross += takeoff - curvatureAt(track, s);
  }
  const landing = x + (bendAcross * speed * CORNER_SCAN_STEP) / bike.curvePush;
  return (
    Math.abs(landing) <= track.roadHalfWidth - JUMP_LANDING_ROOM &&
    Math.abs(curvePushOf(bike, takeoff, speed)) <=
      LANDING_SLIP * margin * lateralSpeedLimit(bike, speed)
  );
};

const landsFrom = (
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  jump: TrackFeature,
  speed: number,
  margin: number
): boolean =>
  landsAfterFlight(
    history,
    track,
    rider,
    lipOf(jump),
    flatFlightLength(jump, speed),
    jump.x,
    speed,
    margin
  );

const crestTakeoffSpeed = (drop: number): number =>
  drop < 0
    ? Math.max(TAKEOFF_SPEED, Math.sqrt(-GRAVITY / drop))
    : Number.POSITIVE_INFINITY;

const crestFlightLength = (track: Track, from: number, speed: number) => {
  const start = heightAt(track, from);
  const rise = slopeAt(track, from);
  for (
    let along = CREST_FLIGHT_STEP;
    along < LONGEST_CREST_FLIGHT;
    along += CREST_FLIGHT_STEP
  ) {
    const height =
      start + rise * along - (GRAVITY * along * along) / (2 * speed * speed);
    if (height <= heightAt(track, from + along)) {
      return along;
    }
  }
  return LONGEST_CREST_FLIGHT;
};

const crestCeiling = (
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  index: number,
  line: number,
  speed: number,
  margin: number
): number => {
  const takeoff = crestTakeoffSpeed(drops[index] ?? 0);
  if (speed <= takeoff) {
    return speed;
  }
  const s = rider.s + index * CORNER_SCAN_STEP;
  const flying = Math.min(speed, FASTEST_LAUNCH);
  const flight = crestFlightLength(track, s, flying);
  return landsAfterFlight(
    history,
    track,
    rider,
    s,
    flight,
    line,
    flying,
    margin
  )
    ? speed
    : takeoff;
};

export const safeLaunchSpeed = (jump: TrackFeature): number => {
  const impact = -HARD_LANDING * JUMP_IMPACT_MARGIN;
  const fall = 2 * GRAVITY * jump.rise;
  return impact * impact > fall
    ? Math.sqrt(impact * impact - fall) / lipSlopeOf(jump)
    : 0;
};

const launchSpeed = (
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  jump: TrackFeature,
  margin: number
): number => {
  let low = 0;
  let high = FASTEST_LAUNCH;
  for (let step = 0; step < LAUNCH_SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (landsFrom(history, track, rider, jump, middle, margin)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return Math.min(low, safeLaunchSpeed(jump));
};

const planCorners = (
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  margin: number,
  line: number,
  slick: Slick
): void => {
  const { bike, speed } = rider;
  const asked = askedLateral(track, rider, line);
  const reserve = Math.min(
    RESERVE_SHARE,
    Math.abs(asked) / Math.max(1, lateralSpeedLimit(bike, speed))
  );
  const manoeuvre = speed / LANE_CHANGE_RATE;
  const stopping =
    (speed * speed) / (2 * SCAN_BRAKING_SHARE * bike.brakeDeceleration) +
    2 * CORNER_SCAN_STEP;
  const jump = rampAhead(track, rider, line, stopping);
  const reach = jump
    ? lipOf(jump) - rider.s + flatFlightLength(jump, FASTEST_LAUNCH) + stopping
    : stopping;
  const count = Math.min(
    CORNER_SCAN_POINTS,
    Math.ceil(reach / CORNER_SCAN_STEP) + 1
  );
  const recovery = slick.metres + speed * OIL_RECOVERY_SECONDS;
  plan.count = count;
  plan.lowest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const ahead = index * CORNER_SCAN_STEP;
    const curve = curvatureAt(track, rider.s + ahead);
    bends[index] = Math.abs(curve);
    slopes[index] = slopeAt(track, rider.s + ahead);
    drops[index] = slopeRateAt(track, rider.s + ahead);
    const grip = ahead <= manoeuvre && asked * curve > 0 ? 1 - reserve : 1;
    const bend = Math.abs(curve);
    const onSlick = ahead + CORNER_SCAN_STEP > slick.metres && ahead < recovery;
    const ceiling = Math.min(
      bend > MIN_BEND
        ? holdingSpeed(bike, bend, grip) * margin
        : Number.POSITIVE_INFINITY,
      onSlick ? slick.speed : Number.POSITIVE_INFINITY
    );
    ceilings[index] = ceiling;
    plan.lowest = Math.min(plan.lowest, ceiling);
  }
  const { braked } = history;
  const last = count - 1;
  braked[last] = ceilings[last] ?? Number.POSITIVE_INFINITY;
  coasted[last] = braked[last] ?? Number.POSITIVE_INFINITY;
  const lipIndex = jump
    ? Math.floor((lipOf(jump) - rider.s) / CORNER_SCAN_STEP)
    : -1;
  for (let index = last - 1; index >= 0; index -= 1) {
    const ceiling = ceilings[index] ?? Number.POSITIVE_INFINITY;
    if (jump && index === lipIndex) {
      const launch = Math.min(
        ceiling,
        launchSpeed(history, track, rider, jump, margin)
      );
      braked[index] = launch;
      coasted[index] = launch;
    } else {
      const grounded = Math.min(
        ceiling,
        slowedFrom(
          rider,
          index,
          braked[index + 1] ?? Number.POSITIVE_INFINITY,
          riding.brakeShare
        )
      );
      const landable = crestCeiling(
        history,
        track,
        rider,
        index,
        line,
        grounded,
        margin
      );
      braked[index] = landable;
      coasted[index] = Math.min(
        landable,
        slowedFrom(
          rider,
          index,
          coasted[index + 1] ?? Number.POSITIVE_INFINITY,
          0
        )
      );
    }
  }
};

export const planForecast = (
  history: PilotHistory,
  track: Track,
  rider: RiderState
): void => {
  if (rider.airborne) {
    plan.paced = 0;
    return;
  }
  planCorners(history, track, rider, riding.margin, rider.x, noSlick);
  const { braked } = history;
  for (let index = 0; index < plan.count; index += 1) {
    paced[index] = braked[index] ?? 0;
  }
  plan.paced = plan.count;
};

export const steeringPush = (
  history: PilotHistory,
  track: Track,
  rider: RiderState
): number => {
  const { bike, speed } = rider;
  const rate = bike.steerRate * weapons[rider.weapon].steerFactor;
  const now = curvePushOf(bike, curvatureAt(track, rider.s), speed);
  const limit = lateralSpeedLimit(bike, speed);
  const horizon = limit / rate;
  let low = Number.NEGATIVE_INFINITY;
  let high = Number.POSITIVE_INFINITY;
  for (let step = 1; step <= LEAD_STEPS; step += 1) {
    const seconds = (horizon * step) / LEAD_STEPS;
    const ahead = speed * seconds;
    const planned = Math.min(
      speed,
      sampleOf(history.braked, plan.count, ahead)
    );
    const push = clamp(
      curvePushOf(bike, curvatureAt(track, rider.s + ahead), planned),
      -limit,
      limit
    );
    low = Math.max(low, push - rate * seconds);
    high = Math.min(high, push + rate * seconds);
  }
  return low > high ? (low + high) / 2 : clamp(now, low, high);
};

interface CornerCall {
  brake: number;
  lift: boolean;
  speed: number;
}

const cornerCall: CornerCall = {
  brake: 0,
  lift: false,
  speed: Number.POSITIVE_INFINITY,
};

export const callCorners = (
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  margin: number,
  line: number,
  slick: Slick
): CornerCall => {
  if (rider.airborne) {
    plan.count = 0;
    cornerCall.brake = 0;
    cornerCall.lift = false;
    cornerCall.speed = Number.POSITIVE_INFINITY;
    return cornerCall;
  }
  const { speed } = rider;
  planCorners(history, track, rider, margin, line, slick);
  const { braking, resisting } = measureDeceleration(track, rider);
  const ahead = speed * BRAKE_LAG_SECONDS * (1 - rider.brake);
  const target = sampleOf(history.braked, plan.count, ahead);
  const further = sampleOf(
    history.braked,
    plan.count,
    ahead + CORNER_SCAN_STEP
  );
  const excess = speed - target;
  const slope = Number.isFinite(further)
    ? Math.max(
        0,
        (target * target - further * further) / (2 * CORNER_SCAN_STEP)
      )
    : 0;
  const pressing = excess > 0 || rider.brake > 0;
  const wanted = slope + BRAKE_PER_EXCESS * excess - resisting;
  const brake = pressing ? clamp(wanted / Math.max(1, braking), 0, 1) : 0;
  cornerCall.brake = runsWide(track, rider) ? 1 : brake;
  cornerCall.speed = target;
  cornerCall.lift =
    cornerCall.brake > 0 ||
    (speed > (coasted[0] ?? Number.POSITIVE_INFINITY) &&
      plan.lowest >= speed * (1 - LIFT_DROP));
  return cornerCall;
};
