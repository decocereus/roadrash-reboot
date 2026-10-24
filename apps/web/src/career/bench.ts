import { benchRaces, benchSetup } from "@racer/career/bench";
import type { Bench } from "@racer/career/bench";
import { practiceSetup } from "@racer/career/field";
import type { RaceRules } from "@racer/career/rules";
import { bikeIds } from "@racer/sim/bikes";
import { roadAtLevel, roadIds, roadLevels } from "@racer/track/road";
import type { RoadId, RoadLevel } from "@racer/track/road";
import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import type { TrackPlan } from "@racer/track/track";
import { madridHook } from "@racer/track/tracks/madrid-hook";

import type { RacePlan } from "../game/hud.ts";

const RIDE_SEED = 31;
const HOOK_FIELD_ROAD: RoadId = "slag-row";
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
  setup: benchSetup(bench),
});

const rideRoad = (
  ride: string | null,
  level: RoadLevel
): { readonly plan: TrackPlan; readonly roadId: RoadId } | null => {
  if (ride === madridHook.id) {
    return { plan: madridHook, roadId: HOOK_FIELD_ROAD };
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
    roadLevels.find((each) => each === Number(flags.get("level"))) ?? 1;
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
