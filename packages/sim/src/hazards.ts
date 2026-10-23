import { lipOf } from "@racer/track/features";
import { hazardSizes } from "@racer/track/hazards";
import type { HazardKind } from "@racer/track/hazards";
import { curvatureAt, slopeAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { forwardRateOf } from "./rider-flight.ts";
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
const ROCK_JOLT_SPEED = 14;
const ROCK_KICK = 0.07;
const ROCK_LOSS = 0.06;
const ROCK_FAST_LOSS = 0.1;
const ROCK_FAST = 55.6;
const ROCK_UPSET = 0.5;
const ROCK_UPSET_SPEED = 55.6;
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
const POTHOLE_CRASH_SPEED = 175 / 3.6;
const POTHOLE_CRASH_LOCK = 0.85;
const FLAT_CLEARANCE = 0.05;
const NEAR_MISS_GAP = 0.8;
const NEAR_MISS_SPEED = 20;

interface HazardSpot {
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

const hazardSpawners = {
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

const slabEnter = (
  from: number,
  to: number,
  centre: number,
  half: number
): number => {
  const delta = to - from;
  if (delta === 0) {
    return Math.abs(from - centre) < half
      ? Number.NEGATIVE_INFINITY
      : Number.POSITIVE_INFINITY;
  }
  return (centre - Math.sign(delta) * half - from) / delta;
};

const slabLeave = (
  from: number,
  to: number,
  centre: number,
  half: number
): number => {
  const delta = to - from;
  if (delta === 0) {
    return Math.abs(from - centre) < half
      ? Number.POSITIVE_INFINITY
      : Number.NEGATIVE_INFINITY;
  }
  return (centre + Math.sign(delta) * half - from) / delta;
};

const entryShare = (
  hazard: Hazard,
  fromS: number,
  fromX: number,
  rider: RiderState
): number => {
  const alongHalf = hazard.halfLength + BIKE_HALF_LENGTH;
  const acrossHalf = hazard.halfWidth + BIKE_HALF_WIDTH;
  const enter = Math.max(
    0,
    slabEnter(fromS, rider.s, hazard.s, alongHalf),
    slabEnter(fromX, rider.x, hazard.x, acrossHalf)
  );
  const leave = Math.min(
    1,
    slabLeave(fromS, rider.s, hazard.s, alongHalf),
    slabLeave(fromX, rider.x, hazard.x, acrossHalf)
  );
  return enter < leave ? enter : -1;
};

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

const shoveOff = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  hazard: Hazard,
  glancing: boolean
): void => {
  const side =
    Math.sign(rider.x - hazard.x) || Math.sign(rider.lateralSpeed) || 1;
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

export const rockUpsetShare = (speed: number): number => {
  const ratio = speed / ROCK_UPSET_SPEED;
  return ROCK_UPSET * (ratio * ratio * ratio);
};

const bumpOver = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  hazardIndex: number,
  hazard: Hazard
): void => {
  const pace = rider.speed;
  const upset = lateralSpeedLimit(rider.bike, pace) * rockUpsetShare(pace);
  const lean =
    Math.sign(rider.lateralSpeed) || Math.sign(rider.x - hazard.x) || 1;
  rider.speed *= 1 - ROCK_LOSS - ROCK_FAST_LOSS * Math.min(1, pace / ROCK_FAST);
  rider.lateralSpeed += lean * upset;
  rider.airborne = true;
  rider.airTicks = 0;
  rider.verticalSpeed =
    ROCK_KICK * pace +
    slopeAt(track, rider.s) * forwardRateOf(rider, curvatureAt(track, rider.s));
  rider.bumpedBy = hazardIndex;
  report(state, riderIndex, rider, hazard, "bump");
};

const hitRock = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  hazardIndex: number,
  hazard: Hazard
): void => {
  const overlap =
    hazard.halfWidth + BIKE_HALF_WIDTH - Math.abs(rider.x - hazard.x);
  if (overlap < ROCK_GLANCE || rider.speed <= ROCK_JOLT_SPEED) {
    shoveOff(state, riderIndex, rider, hazard, overlap < ROCK_GLANCE);
    return;
  }
  bumpOver(state, track, riderIndex, rider, hazardIndex, hazard);
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

const touchedIndex: number[] = [];
const touchedShare: number[] = [];

const gatherTouched = (
  state: RaceState,
  rider: RiderState,
  fromS: number,
  fromX: number
): void => {
  touchedIndex.length = 0;
  touchedShare.length = 0;
  for (let index = 0; index < state.hazards.length; index += 1) {
    const hazard = state.hazards[index];
    if (!hazard) {
      continue;
    }
    const share = clearsHazard(rider, hazard)
      ? -1
      : entryShare(hazard, fromS, fromX, rider);
    if (share < 0) {
      continue;
    }
    let slot = touchedShare.length;
    while (slot > 0 && (touchedShare[slot - 1] ?? 0) > share) {
      touchedShare[slot] = touchedShare[slot - 1] ?? 0;
      touchedIndex[slot] = touchedIndex[slot - 1] ?? 0;
      slot -= 1;
    }
    touchedShare[slot] = share;
    touchedIndex[slot] = index;
  }
};

const meet = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  hazardIndex: number,
  hazard: Hazard,
  throwFor: ThrowForHazard
): void => {
  if (hazard.kind === "oil") {
    slipOnOil(state, riderIndex, rider, hazardIndex, hazard);
  } else if (hazard.kind === "rock") {
    hitRock(state, track, riderIndex, rider, hazardIndex, hazard);
  } else {
    dropIntoPothole(state, riderIndex, rider, hazard, throwFor);
  }
};

export const meetHazards = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  fromS: number,
  fromX: number,
  throwFor: ThrowForHazard
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  const contacts = rider.hazardContacts;
  if (rider.mode !== "riding") {
    contacts.length = 0;
    return;
  }
  gatherTouched(state, rider, fromS, fromX);
  let resolved = 0;
  for (const index of touchedIndex) {
    const hazard = state.hazards[index];
    if (!hazard || rider.mode !== "riding" || rider.airborne) {
      break;
    }
    resolved += 1;
    if (hazard.kind === "oil") {
      rider.slip = OIL_SLIP;
      rider.slipFrom = index;
    }
    if (!contacts.includes(index)) {
      meet(state, track, riderIndex, rider, index, hazard, throwFor);
    }
  }
  contacts.length = 0;
  for (let slot = 0; slot < resolved; slot += 1) {
    contacts.push(touchedIndex[slot] ?? -1);
  }
  for (let index = 0; index < state.hazards.length; index += 1) {
    const hazard = state.hazards[index];
    if (hazard && !contacts.includes(index)) {
      passesClose(state, riderIndex, rider, fromS, hazard);
    }
  }
};
