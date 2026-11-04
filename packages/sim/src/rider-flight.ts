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
import type { RaceState, RiderState } from "./state.ts";

export const HARD_LANDING = -11;
export const LANDING_SLIP = 0.6;
const JUDGED_FLIGHT_TICKS = 15;
const LANDING_LOSS_PER_IMPACT = 0.008;
const MOST_LANDING_LOSS = 0.1;
const WOBBLE_PER_IMPACT = 1 / 12;
const WOBBLE_TURNS = 20;
const WOBBLE_LEAN = 0.35;

export const forwardRateOf = (rider: RiderState, curvature: number): number =>
  rider.speed / Math.max(0.5, 1 - curvature * rider.x);

export const swayOf = (rider: RiderState): number =>
  rider.wobble * sin(rider.wobble * WOBBLE_TURNS);

const SLOW_LEAN = 0.2;
const FULL_LEAN_SPEED = 120 / 3.6;

export const settleVisuals = (
  rider: RiderState,
  authority: number,
  push: number
): void => {
  const limit = Math.max(1, lateralSpeedLimit(rider.bike, rider.speed));
  rider.lean =
    (clamp(rider.lateralSpeed / limit, -1, 1) *
      authority *
      (SLOW_LEAN +
        (1 - SLOW_LEAN) * clamp(rider.speed / FULL_LEAN_SPEED, 0, 1)) +
      swayOf(rider) * WOBBLE_LEAN) *
    rider.bike.visualLean;
  const steered = clamp(
    rider.lateralSpeed - push,
    Math.min(0, rider.lateralSpeed),
    Math.max(0, rider.lateralSpeed)
  );
  rider.heading = atan(steered / Math.max(rider.speed, 6));
};

interface Contact {
  readonly s: number;
  readonly x: number;
  readonly slope: number;
  readonly verticalSpeed: number;
}

const land = (
  state: RaceState,
  track: Track,
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
  rider.air = 0;
  rider.airborne = false;
  rider.airTicks = 0;
  rider.verticalSpeed = 0;
  rider.offRoad = Math.abs(contact.x) > roadHalfWidthAt(track, contact.s);
  const bumpedBy =
    state.hazards[rider.bumpedBy] ??
    state.pedestrians[rider.bumpedWalker] ??
    null;
  rider.bumpedBy = -1;
  rider.bumpedWalker = -1;
  if (
    impact < HARD_LANDING ||
    (judged && (rider.offRoad || slip > LANDING_SLIP))
  ) {
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
  rider.speed *=
    1 - Math.min(MOST_LANDING_LOSS, -impact * LANDING_LOSS_PER_IMPACT);
  rider.wobble = clamp(-impact * WOBBLE_PER_IMPACT + slip, 0, 1);
  state.events.push({
    airSeconds,
    impact,
    kind: "land",
    rider: rider.id,
    s: contact.s,
    x: contact.x,
  });
};

export const fly = (
  state: RaceState,
  track: Track,
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
  settleVisuals(rider, 0.6, push);
  rider.load = 0;
  rider.airTicks += 1;
  if (rider.air > 0) {
    return;
  }
  const share = clamp(fromAir / (fromAir - rider.air), 0, 1);
  const contactS = fromS + (rider.s - fromS) * share;
  land(
    state,
    track,
    rider,
    {
      s: contactS,
      slope: slopeAt(track, contactS),
      verticalSpeed: rise - GRAVITY * TICK_SECONDS * share,
      x: fromX + (rider.x - fromX) * share,
    },
    forwardRate
  );
};
