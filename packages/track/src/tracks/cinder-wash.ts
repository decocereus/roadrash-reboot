import { block } from "../road.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

export const cinderWash: TrackPlan = {
  features: [],
  id: "cinder-wash",
  laneWidth: 3.8,
  lanesEachWay: 2,
  leadInLength: 80,
  level: 1,
  name: "Cinder Wash",
  region: "cinder-flats",
  roadblocks: [],
  runoffLength: 400,
  sections: [
    { climb: 0, length: 400, turnDegrees: 0 },
    { climb: -6, length: 600, turnDegrees: 8 },
    { climb: -3, length: 70, turnDegrees: 0 },
    { climb: 3, length: 70, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 0 },
    { climb: -2.8, length: 60, turnDegrees: 0 },
    { climb: 2.8, length: 60, turnDegrees: 0 },
    { climb: 0, length: 180, turnDegrees: 0 },
    { climb: -2.7, length: 50, turnDegrees: 0 },
    { climb: 2.7, length: 50, turnDegrees: 0 },
    { climb: 2, length: 760, turnDegrees: 0 },
    { climb: 6, length: 200, turnDegrees: 120 },
    { climb: 22, length: 300, turnDegrees: 0 },
    { climb: 4, length: 200, turnDegrees: -30 },
    { climb: 5, length: 120, turnDegrees: 0 },
    { climb: -8, length: 120, turnDegrees: 0 },
    { climb: -20, length: 400, turnDegrees: 24 },
    { climb: 0, length: 250, turnDegrees: -36 },
    { climb: 0, length: 310, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 0 },
    { climb: -4, length: 300, turnDegrees: -14 },
    { climb: 0, length: 900, turnDegrees: 0 },
    { climb: -3.3, length: 70, turnDegrees: 0 },
    { climb: 3.3, length: 70, turnDegrees: 0 },
    { climb: 0, length: 40, turnDegrees: 0 },
    { climb: -3, length: 65, turnDegrees: 0 },
    { climb: 3, length: 65, turnDegrees: 0 },
    { climb: 0, length: 40, turnDegrees: 0 },
    { climb: -2.75, length: 60, turnDegrees: 0 },
    { climb: 2.75, length: 60, turnDegrees: 0 },
    { climb: 2, length: 350, turnDegrees: 0 },
    { climb: 0, length: 210, turnDegrees: -90 },
    { climb: 0, length: 300, turnDegrees: 0 },
    { climb: 6, length: 250, turnDegrees: 26 },
    { climb: 8, length: 200, turnDegrees: 0 },
    { climb: 5, length: 100, turnDegrees: 0 },
    { climb: -7, length: 100, turnDegrees: 0 },
    { climb: -14, length: 350, turnDegrees: -20 },
    { climb: 0, length: 200, turnDegrees: 0 },
    { climb: 0, length: 220, turnDegrees: 34 },
    { climb: 0, length: 300, turnDegrees: 0 },
  ],
  seed: 0xc1_d3_0a,
  shoulderWidth: 1.4,
  trafficPerKilometre: 3,
  vergeWidth: 14,
};

export const cinderWashLevel2 = block([
  [420, 0, 0],
  [60, 0, -3.5],
  [60, 0, 3.5],
  [300, -28, 0],
  [160, 72, 2],
  [150, 0, 0],
]);

export const cinderWashLevel3 = block([
  [560, 0, -2],
  [220, -110, 4],
  [130, 0, 6],
  [80, 0, 4],
  [100, 0, -6],
  [60, 0, 0],
]);

export const cinderWashLevel4 = block([
  [330, 18, -10],
  [65, 0, -3],
  [65, 0, 3],
  [60, 0, -3.2],
  [60, 0, 3.2],
  [220, 0, 0],
  [170, -100, 0],
  [180, 0, 0],
]);

export const cinderWashLevel5 = block([
  [380, 0, 0],
  [180, 130, 8],
  [160, 0, 10],
  [90, 0, 5],
  [100, 0, -9],
  [140, -50, -6],
  [100, 0, 0],
]);

export const cinderWashRoad: Road = {
  blocks: [
    cinderWashLevel2,
    cinderWashLevel3,
    cinderWashLevel4,
    cinderWashLevel5,
  ],
  id: "cinder-wash",
  plan: cinderWash,
  roadblockSpots: [
    { fromLevel: 3, s: 1900 },
    { fromLevel: 3, s: 9050 },
    { fromLevel: 3, s: 10_250 },
  ],
};
