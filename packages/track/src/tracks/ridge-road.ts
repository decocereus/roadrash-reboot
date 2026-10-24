import { eased } from "../alignment.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

export const ridgeRoad: TrackPlan = {
  features: [
    {
      feature: { kind: "jump", length: 16, rise: 0.8, width: 1.2 },
      fromLevel: 1,
      id: "cable-car-ramp",
      placement: "fixed",
      s: 8290,
      x: 3.8,
    },
  ],
  hazardsPerKilometre: 1,
  id: "ridge-road",
  laneWidth: 3.6,
  lanesEachWay: 1,
  leadInLength: 80,
  level: 1,
  name: "Ridge Road",
  pieces: eased([
    [220, 0, 0],
    [260, 22, 4],
    [180, 0, 8],
    [240, -38, 6],
    [160, 0, -9],
    [300, 48, -4],
    [140, 0, 3],
    [170, -44, 0],
    [170, 50, 2],
    [260, 0, 10],
    [90, 0, 7],
    [90, 0, -8],
    [320, -30, -10],
    [200, 16, 3],
    [150, 42, 0],
    [240, 0, -6],
    [280, -52, 8],
    [110, 0, 6],
    [110, 0, -7],
    [260, 26, 0],
    [300, 0, -3],
    [100, 0, 0],
    [450, -34, 4],
    [200, 0, 6],
    [180, 46, 4],
    [160, -40, 0],
    [280, 0, 10],
    [100, 0, 6],
    [100, 0, -8],
    [240, 0, -10],
    [180, -52, -4],
    [200, 0, -6],
    [240, 0, 0],
    [260, 30, 2],
    [200, -24, 4],
    [150, 44, 0],
    [200, 0, -8],
    [300, -36, -6],
    [110, 0, 5],
    [110, 0, -6],
    [240, 20, 0],
    [300, 0, 0],
  ]),
  region: "stonepeak",
  roadblocks: [],
  runoffLength: 400,
  seed: 0x51_ed_27,
  shoulderWidth: 0.9,
  start: { heading: 0, x: 0, z: 0 },
  trafficPerKilometre: 5,
  vergeWidth: 9,
};

const ridgeRoadLevel2 = eased([
  [180, -34, 6],
  [140, 0, 9],
  [160, 70, 4],
  [120, 0, -6],
  [140, -58, -4],
  [410, 0, 2],
]);

const ridgeRoadLevel3 = eased([
  [225, 30, 8],
  [120, 0, 6],
  [95, 0, -8],
  [220, -80, -6],
  [180, 0, 0],
  [160, 62, 4],
  [150, 0, -4],
]);

const ridgeRoadLevel4 = eased([
  [300, 0, -12],
  [140, -96, -3],
  [200, 0, 5],
  [100, 0, 6],
  [90, 0, -7],
  [180, 54, -2],
  [140, 0, 0],
]);

const ridgeRoadLevel5 = eased([
  [180, 40, 10],
  [150, -76, 6],
  [100, 0, 8],
  [105, 0, -10],
  [165, 88, -6],
  [450, 0, -4],
]);

export const ridgeRoadRoad: Road = {
  blocks: [ridgeRoadLevel2, ridgeRoadLevel3, ridgeRoadLevel4, ridgeRoadLevel5],
  id: "ridge-road",
  plan: ridgeRoad,
  roadblockSpots: [
    { fromLevel: 3, s: 9550 },
    { fromLevel: 4, s: 10_950 },
    { fromLevel: 5, s: 12_950 },
  ],
};
