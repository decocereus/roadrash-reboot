import { lipOf } from "@racer/track/features";
import { hazardSizes } from "@racer/track/hazards";
import type { HazardKind } from "@racer/track/hazards";
import type { Track } from "@racer/track/track";

import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  lateralSpeedLimit,
} from "./state.ts";
import type {
  CrashCause,
  Hazard,
  HazardEffect,
  HazardTag,
  RaceState,
  RiderState,
} from "./state.ts";

export const OIL_SLIP = 0.85;
const OIL_WOBBLE = 0.25;
const ROCK_THROW_SPEED = 14;
const ROCK_GLANCE = 0.2;
const ROCK_STAGGER_KEEP = 0.4;
const ROCK_GLANCE_KEEP = 0.8;
const ROCK_STAGGER_WOBBLE = 0.9;
const ROCK_GLANCE_WOBBLE = 0.6;
const ROCK_SHOVE = 2.5;
const ROCK_STUN = 10;
const ROCK_CLEARANCE = 0.02;
const POTHOLE_LOSS = 0.03;
const POTHOLE_FAST_LOSS = 0.03;
const POTHOLE_FAST = 60;
const POTHOLE_WOBBLE = 0.3;
const POTHOLE_WOBBLE_PER_LOCK = 0.6;
const POTHOLE_UNSETTLE_SPEED = 55;
const POTHOLE_CRASH_SPEED = 55;
const POTHOLE_CRASH_LOCK = 0.85;
const FLAT_CLEARANCE = 0.05;
const NEAR_MISS_GAP = 0.8;
const NEAR_MISS_SPEED = 20;

export interface HazardSpot {
  readonly id: string;
  readonly s: number;
  readonly x: number;
  readonly command: string | null;
}

export type SpawnHazard = (
  state: RaceState,
  track: Track,
  spot: HazardSpot
) => Hazard | undefined;

export type ThrowForHazard = (
  state: RaceState,
  riderIndex: number,
  cause: CrashCause,
  bikeKeep: number,
  bodyKeep: number,
  hazard: HazardTag
) => void;

const onRamp = (track: Track, hazard: Hazard): boolean =>
  track.features.some(
    (jump) =>
      hazard.s + hazard.halfLength > jump.s &&
      hazard.s - hazard.halfLength < lipOf(jump) &&
      hazard.x + hazard.halfWidth > jump.x - jump.width / 2 &&
      hazard.x - hazard.halfWidth < jump.x + jump.width / 2
  );

const fitsOnRoad = (state: RaceState, track: Track, hazard: Hazard): boolean =>
  Number.isFinite(hazard.s) &&
  Number.isFinite(hazard.x) &&
  hazard.id !== "" &&
  hazard.s >= 0 &&
  hazard.s <= track.length &&
  Math.abs(hazard.x) + hazard.halfWidth <= track.roadHalfWidth &&
  !onRamp(track, hazard) &&
  state.hazards.every((other) => other.id !== hazard.id);

const spawn = (
  state: RaceState,
  track: Track,
  kind: HazardKind,
  spot: HazardSpot
): Hazard | undefined => {
  const size = hazardSizes[kind];
  const hazard: Hazard = {
    command: spot.command,
    halfLength: size.halfLength,
    halfWidth: size.halfWidth,
    height: size.height,
    id: spot.id,
    kind,
    s: spot.s,
    spawnTick: state.tick,
    x: spot.x,
  };
  if (!fitsOnRoad(state, track, hazard)) {
    return undefined;
  }
  state.hazards.push(hazard);
  return hazard;
};

export const spawnOil: SpawnHazard = (state, track, spot) =>
  spawn(state, track, "oil", spot);

export const spawnRock: SpawnHazard = (state, track, spot) =>
  spawn(state, track, "rock", spot);

export const spawnPothole: SpawnHazard = (state, track, spot) =>
  spawn(state, track, "pothole", spot);

export const hazardSpawners = {
  oil: spawnOil,
  pothole: spawnPothole,
  rock: spawnRock,
} as const satisfies Record<HazardKind, SpawnHazard>;

export const spawnScheduledHazards = (state: RaceState, track: Track): void => {
  for (const placement of track.hazards) {
    hazardSpawners[placement.kind](state, track, {
      command: null,
      id: placement.id,
      s: placement.s,
      x: placement.x,
    });
  }
};

const clearsHazard = (rider: RiderState, hazard: Hazard): boolean =>
  rider.airborne || rider.air >= Math.max(FLAT_CLEARANCE, hazard.height);

const touches = (
  hazard: Hazard,
  fromS: number,
  fromX: number,
  rider: RiderState
): boolean =>
  Math.min(fromS, rider.s) - BIKE_HALF_LENGTH < hazard.s + hazard.halfLength &&
  Math.max(fromS, rider.s) + BIKE_HALF_LENGTH > hazard.s - hazard.halfLength &&
  Math.min(fromX, rider.x) - BIKE_HALF_WIDTH < hazard.x + hazard.halfWidth &&
  Math.max(fromX, rider.x) + BIKE_HALF_WIDTH > hazard.x - hazard.halfWidth;

const report = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  hazard: Hazard,
  effect: HazardEffect
): void => {
  state.events.push({
    effect,
    hazard,
    kind: "hazard",
    rider: riderIndex,
    speed: rider.speed,
  });
};

const slipOnOil = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  hazardIndex: number,
  hazard: Hazard
): void => {
  rider.slip = OIL_SLIP;
  rider.slipFrom = hazardIndex;
  rider.wobble = Math.max(rider.wobble, OIL_WOBBLE);
  report(state, riderIndex, rider, hazard, "slip");
};

const hitRock = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  hazard: Hazard,
  throwFor: ThrowForHazard
): void => {
  const across = rider.x - hazard.x;
  const overlap = hazard.halfWidth + BIKE_HALF_WIDTH - Math.abs(across);
  const glancing = overlap < ROCK_GLANCE;
  if (rider.speed > ROCK_THROW_SPEED && !glancing) {
    throwFor(state, riderIndex, "hazard", 0.3, 0.6, hazard);
    return;
  }
  const side = Math.sign(across) || Math.sign(rider.lateralSpeed) || 1;
  rider.speed *= glancing ? ROCK_GLANCE_KEEP : ROCK_STAGGER_KEEP;
  rider.wobble = Math.max(
    rider.wobble,
    glancing ? ROCK_GLANCE_WOBBLE : ROCK_STAGGER_WOBBLE
  );
  rider.x =
    hazard.x + side * (hazard.halfWidth + BIKE_HALF_WIDTH + ROCK_CLEARANCE);
  rider.lateralSpeed = side * ROCK_SHOVE;
  rider.hitStun = ROCK_STUN;
  report(state, riderIndex, rider, hazard, "stagger");
};

const dropIntoPothole = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  hazard: Hazard,
  throwFor: ThrowForHazard
): void => {
  const lock = clamp(
    Math.abs(rider.lateralSpeed) /
      Math.max(1, lateralSpeedLimit(rider.bike, rider.speed)),
    0,
    1
  );
  if (rider.speed > POTHOLE_CRASH_SPEED && lock > POTHOLE_CRASH_LOCK) {
    throwFor(state, riderIndex, "hazard", 0.6, 0.65, hazard);
    return;
  }
  rider.speed *=
    1 -
    POTHOLE_LOSS -
    POTHOLE_FAST_LOSS * Math.min(1, rider.speed / POTHOLE_FAST);
  rider.wobble = Math.max(
    rider.wobble,
    clamp(
      POTHOLE_WOBBLE +
        POTHOLE_WOBBLE_PER_LOCK *
          lock *
          Math.min(1, rider.speed / POTHOLE_UNSETTLE_SPEED),
      0,
      1
    )
  );
  report(state, riderIndex, rider, hazard, "jolt");
};

const passesClose = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  fromS: number,
  hazard: Hazard
): void => {
  const gap = Math.abs(rider.x - hazard.x) - hazard.halfWidth - BIKE_HALF_WIDTH;
  if (
    fromS < hazard.s &&
    rider.s >= hazard.s &&
    gap >= 0 &&
    gap < NEAR_MISS_GAP &&
    rider.speed > NEAR_MISS_SPEED
  ) {
    state.events.push({
      closingSpeed: rider.speed,
      hazard,
      kind: "nearMiss",
      rider: riderIndex,
    });
  }
};

const firstTouched = (
  state: RaceState,
  rider: RiderState,
  fromS: number,
  fromX: number
): number => {
  let touched = -1;
  for (const [index, hazard] of state.hazards.entries()) {
    if (
      !clearsHazard(rider, hazard) &&
      touches(hazard, fromS, fromX, rider) &&
      (touched < 0 || hazard.s < (state.hazards[touched]?.s ?? 0))
    ) {
      touched = index;
    }
  }
  return touched;
};

export const meetHazards = (
  state: RaceState,
  riderIndex: number,
  fromS: number,
  fromX: number,
  throwFor: ThrowForHazard
): void => {
  const rider = state.riders[riderIndex];
  if (!rider || rider.mode !== "riding") {
    return;
  }
  const index = firstTouched(state, rider, fromS, fromX);
  const hazard = state.hazards[index];
  if (!hazard) {
    rider.hazardContact = -1;
    for (const passed of state.hazards) {
      passesClose(state, riderIndex, rider, fromS, passed);
    }
    return;
  }
  if (hazard.kind === "oil") {
    rider.slip = OIL_SLIP;
  }
  if (index === rider.hazardContact) {
    return;
  }
  rider.hazardContact = index;
  if (hazard.kind === "oil") {
    slipOnOil(state, riderIndex, rider, index, hazard);
  } else if (hazard.kind === "rock") {
    hitRock(state, riderIndex, rider, hazard, throwFor);
  } else {
    dropIntoPothole(state, riderIndex, rider, hazard, throwFor);
  }
};
