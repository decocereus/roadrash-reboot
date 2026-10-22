import type { BikeId } from "@racer/sim/bikes";
import { PLAYER_RIDER } from "@racer/sim/state";
import type { PacingRules } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";

import { setupFor } from "./field.ts";
import type { CareerRaceSetup } from "./field.ts";
import { newCareer } from "./state.ts";
import { STARTING_BIKE } from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

export type Bench = "stress" | "reference";

export interface BenchRace {
  readonly roadId: RoadId;
  readonly level: Level;
  readonly seed: number;
  readonly bikeId: BikeId;
}

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
} as const satisfies Readonly<Record<Bench, BenchRace>>;

const STRESS_COPS = 8;
const STRESS_SIGHT_RANGE = 250;
const STRESS_PLAYER_AGGRESSION = 0.8;
const STRESS_PACING: PacingRules = { catchUp: 0.6, leadEase: 0.8 };

const practiceSetup = (race: BenchRace): CareerRaceSetup =>
  setupFor(
    {
      ...newCareer(race.seed),
      bikeId: race.bikeId,
      garage: [race.bikeId],
      level: race.level,
    },
    race.roadId,
    race.seed,
    trackFor(race.roadId, race.level)
  );

const stressSetup = (): CareerRaceSetup => {
  const setup = practiceSetup(benchRaces.stress);
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
  bench === "stress" ? stressSetup() : practiceSetup(benchRaces.reference);
