import { roadHalfWidthAt } from "@racer/track/districts";
import { atan, sin } from "@racer/track/math";
import { curvatureAt, heightAt, slopeAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { throwRider } from "./rider-crash.ts";
import {
  clamp,
  curvePushOf,
  GRAVITY,
  lateralSpeedLimit,
  TICK_SECONDS,
} from "./state.ts";
import type { BikeSpec, RaceState, RiderState } from "./state.ts";

export const HARD_LANDING = -11;
export const CRASHING_LANDING = -19;
export const LANDING_SLIP = 0.6;
const JUDGED_FLIGHT_TICKS = 15;
const LANDING_LOSS_PER_IMPACT = 0.008;
const MOST_LANDING_LOSS = 0.1;
const HARD_LOSS_PER_IMPACT = 0.02;
const WOBBLE_PER_IMPACT = 1 / 12;
const WOBBLE_TURNS = 20;
const WOBBLE_LEAN = 0.35;

export const forwardRateAt = (
  speed: number,
  curvature: number,
  x: number
): number => speed / Math.max(0.5, 1 - curvature * x);

export const forwardRateOf = (rider: RiderState, curvature: number): number =>
  forwardRateAt(rider.speed, curvature, rider.x);

export const landingSlipOf = (
  bike: BikeSpec,
  lateralSpeed: number,
  curvature: number,
  speed: number
): number =>
  Math.abs(lateralSpeed - curvePushOf(bike, curvature, speed)) /
  Math.max(1, lateralSpeedLimit(bike, speed));

export const swayOf = (rider: RiderState): number =>
  rider.wobble * sin(rider.wobble * WOBBLE_TURNS);

const SLOW_LEAN = 0.2;
const FULL_LEAN_SPEED = 120 / 3.6;

const headingAcross = (rider: RiderState, across: number): number =>
  atan(across / Math.max(rider.speed, 6));

const settleLean = (rider: RiderState, authority: number): void => {
  const limit = Math.max(1, lateralSpeedLimit(rider.bike, rider.speed));
  rider.lean =
    (clamp(rider.lateralSpeed / limit, -1, 1) *
      authority *
      (SLOW_LEAN +
        (1 - SLOW_LEAN) * clamp(rider.speed / FULL_LEAN_SPEED, 0, 1)) +
      swayOf(rider) * WOBBLE_LEAN) *
    rider.bike.visualLean;
};

export const settleVisuals = (
  rider: RiderState,
  authority: number,
  push: number
): void => {
  settleLean(rider, authority);
  rider.heading = headingAcross(
    rider,
    clamp(
      rider.lateralSpeed - push,
      Math.min(0, rider.lateralSpeed),
      Math.max(0, rider.lateralSpeed)
    )
  );
};

export interface Flight {
  s: number;
  x: number;
  air: number;
  verticalSpeed: number;
  airTicks: number;
  readonly speed: number;
  readonly lateralSpeed: number;
  readonly bike: BikeSpec;
}

export const touchdown = {
  ground: 0,
  impact: 0,
  offRoad: false,
  push: 0,
  s: 0,
  slip: 0,
  x: 0,
};

export const stepFlight = (
  track: Track,
  flight: Flight,
  groundBefore: number
): boolean => {
  const fromS = flight.s;
  const fromX = flight.x;
  const fromAir = flight.air;
  const rise = flight.verticalSpeed;
  const curvature = curvatureAt(track, fromS);
  const forwardRate = forwardRateAt(flight.speed, curvature, fromX);
  const push = curvePushOf(flight.bike, curvature, flight.speed);
  flight.x += (flight.lateralSpeed - push) * TICK_SECONDS;
  flight.s += forwardRate * TICK_SECONDS;
  touchdown.ground = heightAt(track, flight.s);
  const drop = touchdown.ground - groundBefore;
  flight.air +=
    rise * TICK_SECONDS - (GRAVITY * TICK_SECONDS * TICK_SECONDS) / 2 - drop;
  flight.verticalSpeed -= GRAVITY * TICK_SECONDS;
  flight.airTicks += 1;
  touchdown.push = push;
  if (flight.air > 0) {
    return false;
  }
  const share = clamp(fromAir / (fromAir - flight.air), 0, 1);
  const s = fromS + (flight.s - fromS) * share;
  touchdown.s = s;
  touchdown.x = fromX + (flight.x - fromX) * share;
  touchdown.impact =
    rise - GRAVITY * TICK_SECONDS * share - slopeAt(track, s) * forwardRate;
  return true;
};

export const settleTouchdown = (track: Track, flight: Flight): void => {
  touchdown.slip = landingSlipOf(
    flight.bike,
    flight.lateralSpeed,
    curvatureAt(track, touchdown.s),
    flight.speed
  );
  touchdown.offRoad =
    Math.abs(touchdown.x) > roadHalfWidthAt(track, touchdown.s);
};

export const judgedFlight = (flight: Flight): boolean =>
  flight.airTicks >= JUDGED_FLIGHT_TICKS;

export const landingCrashes = (flight: Flight): boolean =>
  touchdown.impact <= CRASHING_LANDING ||
  (judgedFlight(flight) &&
    (touchdown.offRoad || touchdown.slip > LANDING_SLIP));

const land = (state: RaceState, track: Track, rider: RiderState): void => {
  settleTouchdown(track, rider);
  const crashes = landingCrashes(rider);
  const { impact, s, slip, x } = touchdown;
  const airSeconds = rider.airTicks * TICK_SECONDS;
  rider.air = 0;
  rider.airborne = false;
  rider.airTicks = 0;
  rider.verticalSpeed = 0;
  rider.offRoad = touchdown.offRoad;
  const bumpedBy =
    state.hazards[rider.bumpedBy] ??
    state.pedestrians[rider.bumpedWalker] ??
    null;
  rider.bumpedBy = -1;
  rider.bumpedWalker = -1;
  if (crashes) {
    throwRider(
      state,
      rider,
      bumpedBy ? "hazard" : "landing",
      0.7,
      0.75,
      undefined,
      bumpedBy
    );
    return;
  }
  const pastHard = Math.max(0, HARD_LANDING - impact);
  rider.speed *=
    1 -
    Math.min(MOST_LANDING_LOSS, -impact * LANDING_LOSS_PER_IMPACT) -
    pastHard * HARD_LOSS_PER_IMPACT;
  rider.wobble = clamp(
    -impact * WOBBLE_PER_IMPACT + slip,
    0,
    1 + pastHard * WOBBLE_PER_IMPACT
  );
  state.events.push({
    airSeconds,
    impact,
    kind: "land",
    rider: rider.id,
    s,
    x,
  });
};

export const fly = (
  state: RaceState,
  track: Track,
  rider: RiderState
): void => {
  const landed = stepFlight(track, rider, heightAt(track, rider.s));
  settleLean(rider, 0.6);
  rider.heading = headingAcross(rider, rider.lateralSpeed - touchdown.push);
  rider.load = 0;
  if (landed) {
    land(state, track, rider);
  }
};
