import { eased } from "../alignment.ts";
import { chevronRuns } from "../chevron-runs.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

const cinderWash: TrackPlan = {
  chevrons: chevronRuns["cinder-wash"],
  features: [
    {
      feature: { kind: "jump", length: 18, rise: 1, width: 1.4 },
      fromLevel: 1,
      id: "drive-in-ramp",
      placement: "fixed",
      s: 4250,
      x: 3.8,
    },
    {
      feature: { kind: "jump", length: 18, rise: 1, width: 1.4 },
      fromLevel: 1,
      id: "salt-pan-ramp",
      placement: "fixed",
      s: 5300,
      x: 3.8,
    },
  ],
  hazardsPerKilometre: 1,
  id: "cinder-wash",
  laneWidth: 3.8,
  lanesEachWay: 2,
  leadInLength: 80,
  level: 1,
  name: "Cinder Wash",
  pieces: eased([
    [400, 0, 0],
    [600, 8, -6],
    [70, 0, -3],
    [70, 0, 3],
    [200, 0, 0],
    [60, 0, -2.8],
    [60, 0, 2.8],
    [180, 0, 0],
    [50, 0, -2.7],
    [50, 0, 2.7],
    [760, 0, 2],
    [200, 120, 6],
    [300, 0, 22],
    [200, -30, 4],
    [120, 0, 5],
    [120, 0, -8],
    [400, 24, -20],
    [250, -36, 0],
    [310, 0, 0],
    [200, 0, 0],
    [300, -14, -4],
    [100, 0, 0],
    [40, 0, 1.4],
    [40, 0, -1.4],
    [720, 0, 0],
    [70, 0, -3.3],
    [70, 0, 3.3],
    [40, 0, 0],
    [65, 0, -3],
    [65, 0, 3],
    [40, 0, 0],
    [60, 0, -2.75],
    [60, 0, 2.75],
    [350, 0, 2],
    [210, -90, 0],
    [300, 0, 0],
    [250, 26, 6],
    [200, 0, 8],
    [100, 0, 5],
    [100, 0, -7],
    [350, -20, -14],
    [200, 0, 0],
    [220, 34, 0],
    [300, 0, 0],
  ]),
  region: "cinder-flats",
  roadblocks: [],
  runoffLength: 400,
  seed: 0xc1_d3_0a,
  shoulderWidth: 1.4,
  start: { heading: 0, x: 0, z: 0 },
  trafficPerKilometre: 3,
  vergeWidth: 14,
};

const cinderWashLevel2 = eased([
  [420, 0, 0],
  [60, 0, -3.5],
  [60, 0, 3.5],
  [300, -28, 0],
  [160, 72, 2],
  [150, 0, 0],
]);

const cinderWashLevel3 = eased([
  [560, 0, -2],
  [220, -110, 4],
  [130, 0, 6],
  [80, 0, 4],
  [100, 0, -6],
  [60, 0, 0],
]);

const cinderWashLevel4 = eased([
  [330, 18, -10],
  [65, 0, -3],
  [65, 0, 3],
  [60, 0, -3.2],
  [60, 0, 3.2],
  [220, 0, 0],
  [170, -100, 0],
  [180, 0, 0],
]);

const cinderWashLevel5 = eased([
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
