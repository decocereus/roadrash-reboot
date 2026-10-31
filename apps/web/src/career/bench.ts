import { benchRaces, benchSetup, recordedRules } from "@racer/career/bench";
import type { Bench } from "@racer/career/bench";
import { practiceSetup } from "@racer/career/field";
import type { RaceRules } from "@racer/career/rules";
import { levelsOf } from "@racer/career/rules";
import { bikeIds } from "@racer/sim/bikes";
import { roadAtLevel, roadIds } from "@racer/track/road";
import type { RoadId, RoadLevel } from "@racer/track/road";
import { roads } from "@racer/track/roads";
import { stretches, stretchIds } from "@racer/track/stretches";
import { compileTrack } from "@racer/track/track";
import type { TrackPlan } from "@racer/track/track";

import type { RacePlan } from "../game/hud.ts";

const RIDE_SEED = 31;
const STRETCH_FIELD_ROAD: RoadId = "slag-row";
const rideCompanies = ["alone", "field", "traffic"] as const;

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
  rules: recordedRules,
  setup: benchSetup(bench),
});

const rideRoad = (
  ride: string | null,
  level: RoadLevel
): { readonly plan: TrackPlan; readonly roadId: RoadId } | null => {
  const stretchId = stretchIds.find((id) => id === ride);
  if (stretchId) {
    return { plan: stretches[stretchId], roadId: STRETCH_FIELD_ROAD };
  }
  const roadId = roadIds.find((id) => id === ride);
  return roadId ? { plan: roadAtLevel(roads[roadId], level), roadId } : null;
};

export const rideOf = (rules: RaceRules, search: string): RacePlan | null => {
  if (!import.meta.env.DEV) {
    return null;
  }
  const flags = new URLSearchParams(search);
  const level =
    levelsOf(rules).find((each) => each === Number(flags.get("level"))) ?? 1;
  const road = rideRoad(flags.get("ride"), level);
  if (!road) {
    return null;
  }
  const bikeId =
    bikeIds.find((id) => id === flags.get("bike")) ?? "ostra-sesta-600";
  const company =
    rideCompanies.find((each) => each === flags.get("with")) ?? "traffic";
  const track = compileTrack(
    company === "traffic" ? road.plan : { ...road.plan, trafficPerKilometre: 0 }
  );
  const setup = practiceSetup(
    rules,
    { bikeId, level, roadId: road.roadId, seed: RIDE_SEED },
    track
  );
  return {
    bikeId,
    mode: "quick",
    rules,
    setup:
      company === "alone"
        ? {
            ...setup,
            field: [],
            police: { ...setup.police, count: 0 },
            rivals: [],
          }
        : setup,
  };
};
