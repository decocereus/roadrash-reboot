import type { BikeId } from "@racer/sim/bikes";
import { pilotInput } from "@racer/sim/pilot";
import { createRace, neutralInput, stepRace } from "@racer/sim/race";
import { PLAYER_RIDER, TICK_RATE } from "@racer/sim/state";
import type { RaceState } from "@racer/sim/state";
import { roadIds, trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { setupFor } from "./field.ts";
import { newCareer } from "./state.ts";
import { levels, RIVALS_PER_RACE } from "./tables.ts";
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
const STARTS = roadIds.length * SEEDS.length;

type Ending = "finished" | "busted" | "wrecked" | "unsettled";

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

const start = (level: Level, roadId: RoadId, seed: number) => {
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
  return { ending, rivalsBusted: rivalsBustedIn(state) };
};

interface Tally {
  busted: number;
  finished: number;
  wrecked: number;
  unsettled: number;
  rivalsBusted: number;
}

const measured = new Map<Level, Tally>();

const seasonAt = (level: Level): Tally => {
  const known = measured.get(level);
  if (known) {
    return known;
  }
  const tally: Tally = {
    busted: 0,
    finished: 0,
    rivalsBusted: 0,
    unsettled: 0,
    wrecked: 0,
  };
  for (const roadId of roadIds) {
    for (const seed of SEEDS) {
      const race = start(level, roadId, seed);
      tally[race.ending] += 1;
      tally.rivalsBusted += race.rivalsBusted;
    }
  }
  measured.set(level, tally);
  return tally;
};

interface Band {
  readonly level: Level;
  readonly fewest: number;
  readonly most: number;
}

const bands: readonly Band[] = [
  { fewest: 2, level: 1, most: 9 },
  { fewest: 3, level: 2, most: 11 },
  { fewest: 4, level: 3, most: 12 },
  { fewest: 4, level: 4, most: 13 },
  { fewest: 5, level: 5, most: 15 },
];

const MINUTES = 60_000;

describe("police balance", () => {
  it.each(bands)(
    "a pilot standing in for the decent player is busted in $fewest to $most of 40 starts at level $level",
    { timeout: 4 * MINUTES },
    ({ fewest, level, most }) => {
      const tally = seasonAt(level);
      expect(tally.busted + tally.finished + tally.wrecked).toBe(STARTS);
      expect(tally.busted).toBeGreaterThanOrEqual(fewest);
      expect(tally.busted).toBeLessThanOrEqual(most);
      expect(tally.rivalsBusted / STARTS).toBeLessThan(
        (2.5 * RIVALS_PER_RACE) / 7
      );
    }
  );

  it(
    "over the five levels the busts come to between an eighth and a quarter of all starts",
    { timeout: 15 * MINUTES },
    () => {
      const starts = levels.length * STARTS;
      const busted = levels
        .map((level) => seasonAt(level).busted)
        .reduce((total, count) => total + count, 0);
      expect(busted / starts).toBeGreaterThan(1 / 8);
      expect(busted / starts).toBeLessThanOrEqual(1 / 4);
    }
  );
});
