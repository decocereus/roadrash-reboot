import type { TrackPieces } from "./alignment.ts";
import type { TrackPlan } from "./track.ts";

export const roadIds = [
  "breakwater-run",
  "cinder-wash",
  "hollow-pine-road",
  "slag-row",
  "ridge-road",
] as const;

export type RoadId = (typeof roadIds)[number];

export const roadLevels = [1, 2, 3, 4, 5] as const;

export type RoadLevel = (typeof roadLevels)[number];

interface RoadblockSpot {
  readonly s: number;
  readonly fromLevel: RoadLevel;
}

export interface Road {
  readonly id: RoadId;
  readonly plan: TrackPlan;
  readonly blocks: readonly [
    TrackPieces,
    TrackPieces,
    TrackPieces,
    TrackPieces,
  ];
  readonly roadblockSpots: readonly RoadblockSpot[];
}

export const roadAtLevel = (road: Road, level: RoadLevel): TrackPlan => ({
  ...road.plan,
  id: `${road.id}-${level}`,
  level,
  pieces: [...road.plan.pieces, ...road.blocks.slice(0, level - 1).flat()],
  roadblocks: road.roadblockSpots
    .filter((spot) => spot.fromLevel <= level)
    .map((spot) => spot.s),
  trafficPerKilometre: road.plan.trafficPerKilometre + level - 1,
});
