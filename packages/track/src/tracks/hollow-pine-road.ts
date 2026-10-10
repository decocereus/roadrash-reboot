import { block } from "../road.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

export const hollowPineRoad: TrackPlan = {
  id: "hollow-pine-road",
  laneWidth: 3.4,
  leadInLength: 80,
  level: 1,
  name: "Hollow Pine Road",
  region: "kettle-woods",
  roadblocks: [],
  runoffLength: 400,
  sections: [
    { climb: 0, length: 260, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: -20 },
    { climb: 3, length: 180, turnDegrees: 30 },
    { climb: 3, length: 180, turnDegrees: -34 },
    { climb: 6, length: 140, turnDegrees: 0 },
    { climb: -6, length: 100, turnDegrees: 0 },
    { climb: -3, length: 160, turnDegrees: 44 },
    { climb: 0, length: 120, turnDegrees: -40 },
    { climb: 0, length: 120, turnDegrees: 38 },
    { climb: -8, length: 340, turnDegrees: 0 },
    { climb: -4, length: 220, turnDegrees: -60 },
    { climb: 4, length: 160, turnDegrees: 0 },
    { climb: 5, length: 90, turnDegrees: 0 },
    { climb: -6, length: 90, turnDegrees: 0 },
    { climb: -2, length: 300, turnDegrees: 32 },
    { climb: 0, length: 200, turnDegrees: -28 },
    { climb: 0, length: 220, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: 64 },
    { climb: 0, length: 380, turnDegrees: 0 },
  ],
  seed: 0x4f_17_e2,
  shoulderWidth: 0.6,
  trafficPerKilometre: 6,
  vergeWidth: 5,
};

export const hollowPineRoadLevel2 = block([
  [200, -36, 2],
  [150, 40, 2],
  [120, 0, 6],
  [90, 0, -7],
  [150, -62, -3],
  [250, 20, -2],
  [190, 0, 0],
]);

export const hollowPineRoadLevel3 = block([
  [160, 52, 0],
  [140, -52, 0],
  [110, 0, 5],
  [85, 0, -6],
  [180, 70, -2],
  [475, 0, -6],
]);

export const hollowPineRoadLevel4 = block([
  [200, -24, 8],
  [100, 0, 6],
  [95, 0, -8],
  [130, -78, -4],
  [140, 66, 0],
  [485, 0, -2],
]);

export const hollowPineRoadLevel5 = block([
  [160, 46, -4],
  [140, -58, -2],
  [420, 0, 6],
  [90, 0, 5],
  [90, 0, -8],
  [150, -90, -3],
  [100, 0, 0],
]);

export const hollowPineRoadRoad: Road = {
  blocks: [
    hollowPineRoadLevel2,
    hollowPineRoadLevel3,
    hollowPineRoadLevel4,
    hollowPineRoadLevel5,
  ],
  id: "hollow-pine-road",
  plan: hollowPineRoad,
  roadblockSpots: [
    { fromLevel: 3, s: 5700 },
    { fromLevel: 4, s: 6850 },
    { fromLevel: 5, s: 7650 },
  ],
};
