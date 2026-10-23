import {
  crossRamps,
  deckHeightOf,
  deckSupportOf,
  deckSlopeOf,
  emptyCrossing,
  emptySupport,
  groundSupport,
  lipOf,
  lipSlopeOf,
  supportAt,
} from "@racer/track/features";
import type { Crossing, Support, TrackFeature } from "@racer/track/features";
import { atan, sin } from "@racer/track/math";
import { curvatureAt, heightAt, slopeAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { glancesOff } from "./rider-collisions.ts";
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
const DECK_STEP = 0.1;
const TOUCH_TOLERANCE = 1e-6;

export const forwardRateOf = (rider: RiderState, curvature: number): number =>
  rider.speed / Math.max(0.5, 1 - curvature * rider.x);

export const swayOf = (rider: RiderState): number =>
  rider.wobble * sin(rider.wobble * WOBBLE_TURNS);

export const settleVisuals = (rider: RiderState, authority: number): void => {
  const limit = Math.max(1, lateralSpeedLimit(rider.bike, rider.speed));
  rider.lean =
    (clamp(rider.lateralSpeed / limit, -1, 1) * authority +
      swayOf(rider) * WOBBLE_LEAN) *
    rider.bike.visualLean;
  rider.heading = atan(rider.lateralSpeed / Math.max(rider.speed, 6)) * 0.5;
};

const under: Support = emptySupport();
const crossing: Crossing = emptyCrossing();

interface Contact {
  readonly s: number;
  readonly x: number;
  readonly slope: number;
  readonly verticalSpeed: number;
}

export const belowDeck = (deckHeight: number, air: number): boolean =>
  deckHeight > air + DECK_STEP;

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
  const bumpedBy = state.hazards[rider.bumpedBy] ?? null;
  rider.bumpedBy = -1;
  if (
    impact < HARD_LANDING ||
    (judged && (rider.offRoad || slip > LANDING_SLIP))
  ) {
    throwRider(
      state,
      riderIndex,
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
    rider: riderIndex,
    s: contact.s,
    x: contact.x,
  });
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

export const settleOnSurface = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  fromS: number,
  fromX: number,
  fromDeck: boolean,
  forwardRate: number
): void => {
  crossRamps(track, fromS, fromX, rider.s, rider.x, fromDeck, crossing);
  const jump = track.features[crossing.feature];
  if (!jump) {
    rider.air = 0;
    return;
  }
  const alongS = rider.s - fromS;
  if (crossing.enter >= 0 && crossing.enterSide) {
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
  if (clearanceAt(from) <= TOUCH_TOLERANCE) {
    return from;
  }
  if (clearanceAt(to) > TOUCH_TOLERANCE) {
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
  jump: TrackFeature,
  featureIndex: number,
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
  deckSupportOf(jump, featureIndex, s, under);
  land(
    state,
    track,
    riderIndex,
    rider,
    {
      s,
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
  settleOnSurface(state, track, riderIndex, rider, s, x, true, forwardRate);
};

export const fly = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState
): void => {
  const fromS = rider.s;
  const fromX = rider.x;
  const fromAir = rider.air;
  const fromDeck =
    fromAir + TOUCH_TOLERANCE >= supportAt(track, fromS, fromX, under).height;
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
  crossRamps(track, fromS, fromX, rider.s, rider.x, fromDeck, crossing);
  const jump = track.features[crossing.feature];
  if (jump) {
    const entry = Math.max(0, crossing.enter);
    traceOverDeck(jump, fromS, rider.s - fromS, fromAir, rise, drop);
    const intoSide = crossing.enter >= 0 && crossing.enterSide;
    const below = -clearanceAt(entry);
    if (below > TOUCH_TOLERANCE) {
      if (intoSide && !glancesOff(state, riderIndex, rider, below, fromX)) {
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
          jump,
          crossing.feature,
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
  groundSupport(under);
  land(
    state,
    track,
    riderIndex,
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
