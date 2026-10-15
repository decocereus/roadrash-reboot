import { STARTING_BIKE } from "@racer/career/tables";
import { PLAYER_RIDER } from "@racer/sim/state";
import type { PacingRules } from "@racer/sim/state";
import { roadLevels } from "@racer/track/road";
import { roadIds } from "@racer/track/roads";

import type { RacePlan } from "../game/hud.ts";
import { planFor } from "./flow.ts";

export type Bench = "stress" | "reference";

const BENCH_SEED = 31;
const STRESS_SEED = 8;
const STRESS_COPS = 8;
const STRESS_SIGHT_RANGE = 250;
const STRESS_PLAYER_AGGRESSION = 0.8;
const STRESS_PACING: PacingRules = { catchUp: 0.6, leadEase: 0.8 };

export const benchOf = (search: string): Bench | null => {
  const value = new URLSearchParams(search).get("stress");
  if (value === null) {
    return null;
  }
  return value === "reference" ? "reference" : "stress";
};

const stressPlan = (): RacePlan => {
  const plan = planFor(null, {
    bikeId: "ostra-sesta-600",
    level: 5,
    mode: "quick",
    roadId: "slag-row",
    seed: STRESS_SEED,
  });
  const { setup } = plan;
  return {
    ...plan,
    setup: {
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
    },
  };
};

const referencePlan = (): RacePlan =>
  planFor(null, {
    bikeId: STARTING_BIKE,
    level: 1,
    mode: "quick",
    roadId: "slag-row",
    seed: BENCH_SEED,
  });

export const benchPlan = (bench: Bench): RacePlan =>
  bench === "stress" ? stressPlan() : referencePlan();

export const rideOf = (search: string): RacePlan | null => {
  const flags = new URLSearchParams(search);
  const roadId = roadIds.find((id) => id === flags.get("ride"));
  if (!(import.meta.env.DEV && roadId)) {
    return null;
  }
  const level =
    roadLevels.find((each) => each === Number(flags.get("level"))) ?? 1;
  return planFor(null, {
    bikeId: "ostra-sesta-600",
    level,
    mode: "quick",
    roadId,
    seed: BENCH_SEED,
  });
};
