import type { TrackPlan, TrackSection } from "./track.ts";

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

export type SectionRow = readonly [
  length: number,
  turnDegrees: number,
  climb: number,
];

export type Block = readonly TrackSection[];

interface RoadblockSpot {
  readonly s: number;
  readonly fromLevel: RoadLevel;
}

export interface Road {
  readonly id: RoadId;
  readonly plan: TrackPlan;
  readonly blocks: readonly [Block, Block, Block, Block];
  readonly roadblockSpots: readonly RoadblockSpot[];
}

export const block = (rows: readonly SectionRow[]): Block =>
  rows.map(([length, turnDegrees, climb]) => ({ climb, length, turnDegrees }));

export const roadAtLevel = (road: Road, level: RoadLevel): TrackPlan => ({
  ...road.plan,
  id: `${road.id}-${level}`,
  level,
  roadblocks: road.roadblockSpots
    .filter((spot) => spot.fromLevel <= level)
    .map((spot) => spot.s),
  sections: [...road.plan.sections, ...road.blocks.slice(0, level - 1).flat()],
  trafficPerKilometre: road.plan.trafficPerKilometre + level - 1,
});
