import type { RegionId } from "./regions.ts";
import { roadAtLevel } from "./road.ts";
import type { Road, RoadId, RoadLevel } from "./road.ts";
import { compileTrack } from "./track.ts";
import type { Track } from "./track.ts";
import { breakwaterRunRoad } from "./tracks/breakwater-run.ts";
import { cinderWashRoad } from "./tracks/cinder-wash.ts";
import { hollowPineRoadRoad } from "./tracks/hollow-pine-road.ts";
import { ridgeRoadRoad } from "./tracks/ridge-road.ts";
import { slagRowRoad } from "./tracks/slag-row.ts";

export const roads = {
  "breakwater-run": breakwaterRunRoad,
  "cinder-wash": cinderWashRoad,
  "hollow-pine-road": hollowPineRoadRoad,
  "ridge-road": ridgeRoadRoad,
  "slag-row": slagRowRoad,
} as const satisfies Record<RoadId, Road>;

export const regionOf = (roadId: RoadId): RegionId => roads[roadId].plan.region;

const createTrackCache = (): ((roadId: RoadId, level: RoadLevel) => Track) => {
  const compiled = new Map<string, Track>();
  return (roadId, level) => {
    const key = `${roadId}-${level}`;
    const cached = compiled.get(key);
    if (cached) {
      return cached;
    }
    const track = compileTrack(roadAtLevel(roads[roadId], level));
    compiled.set(key, track);
    return track;
  };
};

export const trackFor = createTrackCache();
