import { block } from "../road.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

export const breakwaterRun: TrackPlan = {
  id: "breakwater-run",
  laneWidth: 3.6,
  leadInLength: 80,
  level: 1,
  name: "Breakwater Run",
  region: "salt-coast",
  roadblocks: [],
  runoffLength: 400,
  sections: [
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: 2, length: 300, turnDegrees: -18 },
    { climb: 6, length: 200, turnDegrees: 0 },
    { climb: 4, length: 160, turnDegrees: 34 },
    { climb: -12, length: 120, turnDegrees: 0 },
    { climb: -4, length: 220, turnDegrees: -42 },
    { climb: 0, length: 700, turnDegrees: 38 },
    { climb: 0, length: 300, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: -55 },
    { climb: 2, length: 160, turnDegrees: 48 },
    { climb: 8, length: 360, turnDegrees: 0 },
    { climb: 6, length: 100, turnDegrees: 0 },
    { climb: -9, length: 100, turnDegrees: 0 },
    { climb: -5, length: 300, turnDegrees: -26 },
    { climb: 0, length: 200, turnDegrees: 30 },
    { climb: 0, length: 300, turnDegrees: 0 },
  ],
  seed: 0xb4_7a_c1,
  shoulderWidth: 0.9,
  trafficPerKilometre: 5,
  vergeWidth: 7,
};

export const breakwaterRunLevel2 = block([
  [220, -20, 0],
  [180, 0, 4],
  [160, 62, 2],
  [140, -48, -2],
  [280, 0, -4],
  [170, 0, 0],
]);

export const breakwaterRunLevel3 = block([
  [320, 44, 6],
  [120, 0, 7],
  [100, 0, -9],
  [200, -70, -4],
  [240, 22, 0],
  [170, 0, 0],
]);

export const breakwaterRunLevel4 = block([
  [500, -36, 0],
  [160, 0, 0],
  [130, 84, 3],
  [160, -40, 3],
  [200, 0, -6],
]);

export const breakwaterRunLevel5 = block([
  [200, 0, 10],
  [90, 0, 5],
  [100, 0, -8],
  [170, -92, -5],
  [140, 58, 0],
  [260, 30, 0],
  [190, 0, -2],
]);

export const breakwaterRunRoad: Road = {
  blocks: [
    breakwaterRunLevel2,
    breakwaterRunLevel3,
    breakwaterRunLevel4,
    breakwaterRunLevel5,
  ],
  id: "breakwater-run",
  plan: breakwaterRun,
  roadblockSpots: [
    { fromLevel: 3, s: 2800 },
    { fromLevel: 3, s: 4850 },
    { fromLevel: 5, s: 7450 },
  ],
};
