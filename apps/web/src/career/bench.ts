import { benchRaces, benchSetup } from "@racer/career/bench";
import type { Bench } from "@racer/career/bench";
import type { RaceRules } from "@racer/career/rules";
import { roadIds, roadLevels } from "@racer/track/road";

import type { RacePlan } from "../game/hud.ts";
import { planFor } from "./flow.ts";

const RIDE_SEED = 31;

export const benchOf = (search: string): Bench | null => {
  const value = new URLSearchParams(search).get("stress");
  if (value === null) {
    return null;
  }
  return value === "reference" ? "reference" : "stress";
};

export const benchPlan = (bench: Bench): RacePlan => ({
  bikeId: benchRaces[bench].bikeId,
  mode: "quick",
  setup: benchSetup(bench),
});

export const rideOf = (rules: RaceRules, search: string): RacePlan | null => {
  const flags = new URLSearchParams(search);
  const roadId = roadIds.find((id) => id === flags.get("ride"));
  if (!(import.meta.env.DEV && roadId)) {
    return null;
  }
  const level =
    roadLevels.find((each) => each === Number(flags.get("level"))) ?? 1;
  return planFor(rules, null, {
    bikeId: "ostra-sesta-600",
    level,
    mode: "quick",
    roadId,
    seed: RIDE_SEED,
  });
};
