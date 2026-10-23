import type { BikeId } from "@racer/sim/bikes";
import { pilotInput } from "@racer/sim/pilot";
import { createRace, neutralInput, stepRace } from "@racer/sim/race";
import { PLAYER_RIDER, TICK_RATE } from "@racer/sim/state";
import type { RaceState } from "@racer/sim/state";
import { roadIds, trackFor } from "@racer/track/roads";

import { setupFor } from "./field.ts";
import { newCareer } from "./state.ts";
import { levels } from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

const decentBikes = {
  1: "halden-wren-400",
  2: "halden-kite-500",
  3: "ostra-sesta-600",
  4: "ostra-sette-750",
  5: "halden-meridian-900",
} as const satisfies Record<Level, BikeId>;

const DECENT_SKILL = 0.9;
const DECENT_AGGRESSION = 0.5;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SEED_STEP = 7919;
const RACE_LIMIT_SECONDS = 600;
export const STARTS = roadIds.length * SEEDS.length;

const endings = ["finished", "busted", "wrecked", "unsettled"] as const;
type Ending = (typeof endings)[number];

interface PoliceStart {
  readonly level: Level;
  readonly roadId: RoadId;
  readonly seed: number;
}

export interface PoliceRide {
  readonly level: Level;
  readonly ending: Ending;
  readonly rivalsBusted: number;
}

export const policeStarts: readonly PoliceStart[] = levels.flatMap((level) =>
  roadIds.flatMap((roadId) => SEEDS.map((seed) => ({ level, roadId, seed })))
);

const endingOf = (state: RaceState): Ending => {
  const player = state.riders[PLAYER_RIDER];
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
    (rider, index) =>
      index !== PLAYER_RIDER &&
      rider.profile.role === "racer" &&
      rider.mode === "busted"
  ).length;

const ridePolice = ({ level, roadId, seed }: PoliceStart): PoliceRide => {
  const track = trackFor(roadId, level);
  const bikeId = decentBikes[level];
  const setup = setupFor(
    { ...newCareer(seed), bikeId, garage: [bikeId], level },
    roadId,
    seed * SEED_STEP + level,
    track
  );
  const state = createRace({
    ...setup,
    player: {
      ...setup.player,
      aggression: DECENT_AGGRESSION,
      skill: DECENT_SKILL,
    },
  });
  const inputs = state.riders.map(() => ({ ...neutralInput }));
  let ending = endingOf(state);
  for (
    let tick = 0;
    tick < RACE_LIMIT_SECONDS * TICK_RATE && ending === "unsettled";
    tick += 1
  ) {
    for (const [index, input] of inputs.entries()) {
      pilotInput(state, track, index, input);
    }
    stepRace(state, track, inputs);
    ending = endingOf(state);
  }
  return { ending, level, rivalsBusted: rivalsBustedIn(state) };
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
      level: start.level,
      rivalsBusted: Atomics.load(season, 2 + RIDE_SLOTS * index),
    };
  });
