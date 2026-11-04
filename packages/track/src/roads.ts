import type { RegionId } from "./regions.ts";
import type { RoadId } from "./road.ts";
import { compileTrack } from "./track.ts";
import type { Track, TrackPlan } from "./track.ts";
import { breakwaterRun } from "./tracks/breakwater-run.ts";
import { ridgeRoad } from "./tracks/ridge-road.ts";
import { slagRow } from "./tracks/slag-row.ts";

export const roads = {
  "breakwater-run": breakwaterRun,
  "ridge-road": ridgeRoad,
  "slag-row": slagRow,
} as const satisfies Record<RoadId, TrackPlan>;

export const regionOf = (roadId: RoadId): RegionId => roads[roadId].region;

const createTrackCache = (): ((roadId: RoadId) => Track) => {
  const compiled = new Map<RoadId, Track>();
  return (roadId) => {
    const cached = compiled.get(roadId);
    if (cached) {
      return cached;
    }
    const track = compileTrack(roads[roadId]);
    compiled.set(roadId, track);
    return track;
  };
};

export const trackFor = createTrackCache();
