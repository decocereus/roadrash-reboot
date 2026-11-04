import type { BikeId } from "@racer/sim/bikes";
import { createRace, emptyFrame, stepRace } from "@racer/sim/race";
import { PLAYER_RIDER, TICK_RATE, riderOf } from "@racer/sim/state";
import type { RaceState } from "@racer/sim/state";
import { roadIds } from "@racer/track/road";
import { trackFor } from "@racer/track/roads";

import { recordedRules } from "./bench.ts";
import { setupFor } from "./field.ts";
import { newCareer } from "./state.ts";
import { tiers } from "./tables.ts";
import type { Tier, RoadId } from "./tables.ts";

const decentBikes = {
  1: "halden-wren-400",
  2: "ostra-sesta-600",
  3: "halden-meridian-900",
} as const satisfies Record<Tier, BikeId>;

const DECENT_SKILL = 0.9;
const DECENT_AGGRESSION = 0.5;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14];
const SEED_STEP = 7919;
const RACE_LIMIT_SECONDS = 600;
export const STARTS = roadIds.length * SEEDS.length;

const endings = ["finished", "busted", "wrecked", "unsettled"] as const;
type Ending = (typeof endings)[number];

interface PoliceStart {
  readonly tier: Tier;
  readonly roadId: RoadId;
  readonly seed: number;
}

export interface PoliceRide {
  readonly tier: Tier;
  readonly ending: Ending;
  readonly rivalsBusted: number;
}

export const policeStarts: readonly PoliceStart[] = tiers.flatMap((tier) =>
  roadIds.flatMap((roadId) => SEEDS.map((seed) => ({ roadId, seed, tier })))
);

const endingOf = (state: RaceState): Ending => {
  const player = riderOf(state.riders, PLAYER_RIDER);
  if (!player) {
    throw new Error("The race has no player.");
  }
  if (player.finishTick >= 0) {
    return "finished";
  }
  if (player.mode === "busted" || player.mode === "wrecked") {
    return player.mode;
  }
  return "unsettled";
};

const rivalsBustedIn = (state: RaceState): number =>
  state.riders.filter(
    (rider) =>
      rider.id !== PLAYER_RIDER &&
      rider.profile.role === "racer" &&
      rider.mode === "busted"
  ).length;

const ridePolice = ({ tier, roadId, seed }: PoliceStart): PoliceRide => {
  const track = trackFor(roadId);
  const bikeId = decentBikes[tier];
  const setup = setupFor(
    recordedRules,
    { ...newCareer(seed), bikeId, garage: [bikeId], tier },
    roadId,
    seed * SEED_STEP + tier,
    track
  );
  const state = createRace({
    ...setup,
    player: {
      ...setup.player,
      aggression: DECENT_AGGRESSION,
      controller: "pilot",
      skill: DECENT_SKILL,
    },
  });
  let ending = endingOf(state);
  for (
    let tick = 0;
    tick < RACE_LIMIT_SECONDS * TICK_RATE && ending === "unsettled";
    tick += 1
  ) {
    stepRace(state, track, emptyFrame);
    ending = endingOf(state);
  }
  return { ending, rivalsBusted: rivalsBustedIn(state), tier };
};

const RIDE_SLOTS = 2;

export const SEASON_SLOTS = 1 + RIDE_SLOTS * policeStarts.length;

export const takeStart = (season: Int32Array): number =>
  policeStarts.length - 1 - Atomics.add(season, 0, 1);

export const recordRide = (season: Int32Array, index: number): void => {
  const start = policeStarts[index];
  if (!start) {
    throw new Error(`The police season has no start ${index}.`);
  }
  const ride = ridePolice(start);
  Atomics.store(
    season,
    1 + RIDE_SLOTS * index,
    endings.indexOf(ride.ending) + 1
  );
  Atomics.store(season, 2 + RIDE_SLOTS * index, ride.rivalsBusted);
};

export const ridesIn = (season: Int32Array): readonly PoliceRide[] =>
  policeStarts.map((start, index) => {
    const ending = endings[Atomics.load(season, 1 + RIDE_SLOTS * index) - 1];
    if (!ending) {
      throw new Error(`Police start ${index} was never ridden.`);
    }
    return {
      ending,
      rivalsBusted: Atomics.load(season, 2 + RIDE_SLOTS * index),
      tier: start.tier,
    };
  });
