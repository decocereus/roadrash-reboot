import { PLAYER_RIDER } from "@racer/sim/state";
import type { PacingRules } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";

import { practiceSetup } from "./field.ts";
import type { CareerRaceSetup, PracticeRace } from "./field.ts";
import type { RaceRules } from "./rules.ts";
import { STARTING_BIKE } from "./tables.ts";

export type Bench = "stress" | "reference";

export const recordedRules: RaceRules = {
  fieldSize: 15,
  levelCount: 5,
  police: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
};

export const benchRaces = {
  reference: {
    bikeId: STARTING_BIKE,
    level: 1,
    roadId: "slag-row",
    seed: 31,
  },
  stress: {
    bikeId: "ostra-sesta-600",
    level: 5,
    roadId: "slag-row",
    seed: 8,
  },
} as const satisfies Readonly<Record<Bench, PracticeRace>>;

const STRESS_COPS = 8;
const STRESS_SIGHT_RANGE = 250;
const STRESS_PLAYER_AGGRESSION = 0.8;
const STRESS_PACING: PacingRules = { catchUp: 0.6, leadEase: 0.8 };

const benchRaceSetup = (race: PracticeRace): CareerRaceSetup =>
  practiceSetup(recordedRules, race, trackFor(race.roadId, race.level));

const stressSetup = (): CareerRaceSetup => {
  const setup = benchRaceSetup(benchRaces.stress);
  return {
    ...setup,
    pacing: STRESS_PACING,
    player: { ...setup.player, aggression: STRESS_PLAYER_AGGRESSION },
    police: {
      ...setup.police,
      count: STRESS_COPS,
      sightRange: STRESS_SIGHT_RANGE,
    },
    rivals: setup.rivals.map((rival) => ({
      ...rival,
      aggressionBoost: 1 - rival.aggression,
      grudge: PLAYER_RIDER,
    })),
  };
};

export const benchSetup = (bench: Bench): CareerRaceSetup =>
  bench === "stress" ? stressSetup() : benchRaceSetup(benchRaces.reference);
