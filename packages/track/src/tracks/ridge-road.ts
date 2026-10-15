import { block } from "../road.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

export const ridgeRoad: TrackPlan = {
  features: [],
  id: "ridge-road",
  laneWidth: 3.6,
  lanesEachWay: 1,
  leadInLength: 80,
  level: 1,
  name: "Ridge Road",
  region: "stonepeak",
  roadblocks: [],
  runoffLength: 400,
  sections: [
    { climb: 0, length: 220, turnDegrees: 0 },
    { climb: 4, length: 260, turnDegrees: 22 },
    { climb: 8, length: 180, turnDegrees: 0 },
    { climb: 6, length: 240, turnDegrees: -38 },
    { climb: -9, length: 160, turnDegrees: 0 },
    { climb: -4, length: 300, turnDegrees: 48 },
    { climb: 3, length: 140, turnDegrees: 0 },
    { climb: 0, length: 170, turnDegrees: -44 },
    { climb: 2, length: 170, turnDegrees: 50 },
    { climb: 10, length: 260, turnDegrees: 0 },
    { climb: 7, length: 90, turnDegrees: 0 },
    { climb: -8, length: 90, turnDegrees: 0 },
    { climb: -10, length: 320, turnDegrees: -30 },
    { climb: 3, length: 200, turnDegrees: 16 },
    { climb: 0, length: 150, turnDegrees: 42 },
    { climb: -6, length: 240, turnDegrees: 0 },
    { climb: 8, length: 280, turnDegrees: -52 },
    { climb: 6, length: 110, turnDegrees: 0 },
    { climb: -7, length: 110, turnDegrees: 0 },
    { climb: 0, length: 260, turnDegrees: 26 },
    { climb: -3, length: 300, turnDegrees: 0 },
    { climb: 0, length: 100, turnDegrees: 0 },
    { climb: 4, length: 450, turnDegrees: -34 },
    { climb: 6, length: 200, turnDegrees: 0 },
    { climb: 4, length: 180, turnDegrees: 46 },
    { climb: 0, length: 160, turnDegrees: -40 },
    { climb: 10, length: 280, turnDegrees: 0 },
    { climb: 6, length: 100, turnDegrees: 0 },
    { climb: -8, length: 100, turnDegrees: 0 },
    { climb: -10, length: 240, turnDegrees: 0 },
    { climb: -4, length: 180, turnDegrees: -52 },
    { climb: -6, length: 200, turnDegrees: 0 },
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: 2, length: 260, turnDegrees: 30 },
    { climb: 4, length: 200, turnDegrees: -24 },
    { climb: 0, length: 150, turnDegrees: 44 },
    { climb: -8, length: 200, turnDegrees: 0 },
    { climb: -6, length: 300, turnDegrees: -36 },
    { climb: 5, length: 110, turnDegrees: 0 },
    { climb: -6, length: 110, turnDegrees: 0 },
    { climb: 0, length: 240, turnDegrees: 20 },
    { climb: 0, length: 300, turnDegrees: 0 },
  ],
  seed: 0x51_ed_27,
  shoulderWidth: 0.9,
  trafficPerKilometre: 5,
  vergeWidth: 9,
};

export const ridgeRoadLevel2 = block([
  [180, -34, 6],
  [140, 0, 9],
  [160, 70, 4],
  [120, 0, -6],
  [140, -58, -4],
  [410, 0, 2],
]);

export const ridgeRoadLevel3 = block([
  [225, 30, 8],
  [120, 0, 6],
  [95, 0, -8],
  [220, -80, -6],
  [180, 0, 0],
  [160, 62, 4],
  [150, 0, -4],
]);

export const ridgeRoadLevel4 = block([
  [300, 0, -12],
  [140, -96, -3],
  [200, 0, 5],
  [100, 0, 6],
  [90, 0, -7],
  [180, 54, -2],
  [140, 0, 0],
]);

export const ridgeRoadLevel5 = block([
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
