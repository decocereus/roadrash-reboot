import type { OrdinaryRivalId } from "@racer/sim/cast";
import { PLAYER_RIDER } from "@racer/sim/state";
import type { PacingRules } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";

import { practiceSetup } from "./field.ts";
import type { CareerRaceSetup, PracticeRace } from "./field.ts";
import type { RaceRules } from "./rules.ts";
import { STARTING_BIKE } from "./tables.ts";

export const benches = ["stress", "reference", "breakwater", "ridge"] as const;

export type Bench = (typeof benches)[number];

export const recordedCast = [
  "juno-kade",
  "ruth-ann-bixby",
  "dee-santangelo",
  "ines-marchetti",
  "mags-dunleavy",
  "lyle-gorski",
  "tristan-lux",
  "coach-dale-hutto",
  "moose-kowalczyk",
  "gus-abernathy",
  "benny-okafor",
  "wanda-pruitt",
  "orrin-blackwell",
  "agnes-mulcahy",
  "hollis-thorne",
  "felix-aurand",
] as const satisfies readonly OrdinaryRivalId[];

export const recordedRules: RaceRules = {
  bikeMatches: [],
  celebrities: false,
  fieldSize: 15,
  ordinaryCast: recordedCast,
};

export const benchRaces = {
  breakwater: {
    bikeId: "ostra-sesta-600",
    roadId: "breakwater-run",
    seed: 8,
    tier: 3,
  },
  reference: {
    bikeId: STARTING_BIKE,
    roadId: "slag-row",
    seed: 31,
    tier: 1,
  },
  ridge: {
    bikeId: "ostra-sesta-600",
    roadId: "ridge-road",
    seed: 31,
    tier: 3,
  },
  stress: {
    bikeId: "ostra-sesta-600",
    roadId: "slag-row",
    seed: 8,
    tier: 3,
  },
} as const satisfies Readonly<Record<Bench, PracticeRace>>;

const STRESS_COPS = 8;
const STRESS_SIGHT_RANGE = 250;
const STRESS_PLAYER_AGGRESSION = 0.8;
const STRESS_PACING: PacingRules = { catchUp: 0.6, leadEase: 0.8 };

const benchRaceSetup = (race: PracticeRace): CareerRaceSetup =>
  practiceSetup(recordedRules, race, trackFor(race.roadId));

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

const withoutWalkers = (setup: CareerRaceSetup): CareerRaceSetup => ({
  ...setup,
  track: { ...setup.track, walkSites: [] },
});

export const benchSetup = (bench: Bench): CareerRaceSetup => {
  switch (bench) {
    case "stress": {
      return withoutWalkers(stressSetup());
    }
    case "reference": {
      return withoutWalkers(benchRaceSetup(benchRaces.reference));
    }
    case "breakwater":
    case "ridge": {
      return benchRaceSetup(benchRaces[bench]);
    }
    default: {
      return bench satisfies never;
    }
  }
};
