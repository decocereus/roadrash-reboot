import { hypot2 } from "@racer/track/math";
import type { Track } from "@racer/track/track";

import type { RaceView } from "./race-view.ts";
import { BIKE_HALF_LENGTH, riderOf } from "./state.ts";
import type { RaceState, RiderId, RiderState } from "./state.ts";
import { disarm } from "./weapons.ts";

export const PATROL_SPEED = 22;
const BODY_RANGE = 60;
const WAKE_RANGE = 35;
const LOSE_RANGE = 120;
const BUST_REACH = 4;
const BUST_DELAY_TICKS = 30;
export const PULL_OVER = 1.1;

export const isDown = (rider: RiderState): boolean =>
  rider.mode === "thrown" ||
  rider.mode === "lying" ||
  rider.mode === "running" ||
  rider.mode === "mounting";

const arrestable = (rider: RiderState): boolean =>
  isDown(rider) &&
  (rider.mode !== "thrown" || rider.modeTicks >= BUST_DELAY_TICKS);

export const onBeat = (state: RaceState, cop: RiderState): boolean =>
  cop.s < cop.post + state.police.beat;

const wanted = (rider: RiderState): boolean =>
  rider.profile.role === "racer" &&
  rider.finishTick < 0 &&
  rider.mode !== "busted" &&
  rider.mode !== "wrecked";

const bodyAhead = (cop: RiderState, rider: RiderState): number =>
  rider.bodyS - cop.s;

const stillChasing = (cop: RiderState, rider: RiderState): boolean => {
  if (!wanted(rider)) {
    return false;
  }
  if (isDown(rider)) {
    const ahead = bodyAhead(cop, rider);
    return ahead > -BUST_REACH && ahead < BODY_RANGE;
  }
  return rider.mode === "riding" && Math.abs(rider.s - cop.s) < LOSE_RANGE;
};

const pickTarget = (
  state: RaceState,
  cop: RiderState
): RiderState | undefined => {
  let best: RiderState | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const rider of state.riders) {
    if (!wanted(rider)) {
      continue;
    }
    let score = Number.POSITIVE_INFINITY;
    if (isDown(rider)) {
      const ahead = bodyAhead(cop, rider);
      if (ahead > -BUST_REACH && ahead < BODY_RANGE) {
        score = Math.abs(ahead) - BODY_RANGE;
      }
    } else if (rider.mode === "riding") {
      const gap = Math.abs(rider.s - cop.s);
      score = gap < state.police.sightRange ? gap : score;
    }
    if (score < bestScore) {
      bestScore = score;
      best = rider;
    }
  }
  return best;
};

const passing = (cop: RiderState, rider: RiderState): boolean => {
  const ahead = bodyAhead(cop, rider);
  return ahead > -BIKE_HALF_LENGTH * 2 && ahead < WAKE_RANGE;
};

const stillParked = (state: RaceState, cop: RiderState): boolean =>
  cop.parked &&
  !state.riders.some((rider) => wanted(rider) && passing(cop, rider));

const updateChase = (state: RaceState, cop: RiderState) => {
  if (cop.mode !== "riding") {
    cop.chase = null;
    return;
  }
  cop.parked = stillParked(state, cop);
  if (cop.parked) {
    return;
  }
  const current = riderOf(state.riders, cop.chase);
  const next = pickTarget(state, cop);
  let quarry = current && stillChasing(cop, current) ? current : next;
  if (next && isDown(next)) {
    quarry = next;
  }
  if (!(onBeat(state, cop) || (quarry && isDown(quarry)))) {
    quarry = undefined;
  }
  const chosen = quarry?.id ?? null;
  if (chosen !== null && chosen !== cop.chase) {
    state.events.push({ kind: "pursuit", rider: cop.id, target: chosen });
  }
  cop.chase = chosen;
};

export const pullOver = (track: Track, rider: RiderState): void => {
  const side = Math.sign(rider.bodyX) || 1;
  rider.x = side * (track.roadHalfWidth + PULL_OVER);
  rider.bodyX = side * (track.roadHalfWidth + PULL_OVER + 0.8);
  rider.bodyS = rider.s;
  rider.heading = 0;
  rider.modeTicks = 0;
  rider.speed = 0;
  rider.lateralSpeed = 0;
  rider.bodySpeed = 0;
  rider.bodyLateralSpeed = 0;
  rider.bodyVerticalSpeed = 0;
  rider.bodyAir = 0;
  rider.attack = "none";
  rider.attackTicks = 0;
  disarm(rider);
};

const bust = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  cop: RiderState
): void => {
  state.events.push({
    cop: cop.id,
    fine: state.police.fine,
    kind: "busted",
    rider: rider.id,
    s: rider.bodyS,
    weapon: rider.weaponAtThrow,
    x: rider.bodyX,
  });
  rider.mode = "busted";
  pullOver(track, rider);
};

export const chaserDistance = (state: RaceView, chased: RiderId): number => {
  const rider = riderOf(state.riders, chased);
  let nearest = -1;
  for (const cop of state.riders) {
    if (rider && cop.profile.role === "police" && cop.chase === chased) {
      const distance = hypot2(rider.bodyS - cop.s, rider.bodyX - cop.x);
      nearest = nearest < 0 ? distance : Math.min(nearest, distance);
    }
  }
  return nearest;
};

const catchDowned = (state: RaceState, track: Track, cop: RiderState) => {
  if (cop.mode !== "riding" || cop.airborne) {
    return;
  }
  for (const rider of state.riders) {
    const reach = hypot2(rider.bodyS - cop.s, rider.bodyX - cop.x);
    if (wanted(rider) && arrestable(rider) && reach < BUST_REACH) {
      bust(state, track, rider, cop);
    }
  }
};

export const stepPolice = (state: RaceState, track: Track): void => {
  for (const cop of state.riders) {
    if (cop.profile.role === "police") {
      updateChase(state, cop);
      catchDowned(state, track, cop);
    }
  }
};
