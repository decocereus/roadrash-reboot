import { eased } from "../alignment.ts";
import { chevronRuns } from "../chevron-runs.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

export const hollowPineRoad: TrackPlan = {
  chevrons: chevronRuns["hollow-pine-road"],
  features: [
    {
      feature: { kind: "jump", length: 16, rise: 0.8, width: 1 },
      fromLevel: 1,
      id: "sawmill-ramp",
      placement: "fixed",
      s: 3330,
      x: 3.45,
    },
    {
      feature: { kind: "jump", length: 16, rise: 0.8, width: 1 },
      fromLevel: 1,
      id: "kiln-ramp",
      placement: "fixed",
      s: 7760,
      x: 3.45,
    },
  ],
  hazardsPerKilometre: 1,
  id: "hollow-pine-road",
  laneWidth: 3.4,
  lanesEachWay: 1,
  leadInLength: 80,
  level: 1,
  name: "Hollow Pine Road",
  pieces: eased([
    [260, 0, 0],
    [200, -20, 0],
    [180, 30, 3],
    [180, -34, 3],
    [140, 0, 6],
    [100, 0, -6],
    [160, 44, -3],
    [120, -40, 0],
    [120, 38, 0],
    [340, 0, -8],
    [220, -60, -4],
    [160, 0, 4],
    [90, 0, 5],
    [90, 0, -6],
    [300, 32, -2],
    [200, -28, 0],
    [220, 0, 0],
    [140, 64, 0],
    [380, 0, 0],
    [200, -26, 0],
    [180, 0, -4],
    [160, 48, -3],
    [140, -44, -2],
    [200, 0, 2],
    [260, 18, 6],
    [100, 0, 4],
    [100, 0, -6],
    [220, -30, -4],
    [140, 52, 0],
    [350, 0, -6],
    [190, -66, -4],
    [220, 24, 0],
    [260, -36, 3],
    [140, 0, 5],
    [100, 0, -7],
    [220, 30, -3],
    [140, -58, 0],
    [160, 50, 0],
    [240, 0, 0],
    [200, -28, 0],
    [150, 66, 0],
    [380, 0, 0],
  ]),
  region: "kettle-woods",
  roadblocks: [],
  runoffLength: 400,
  seed: 0x4f_17_e2,
  shoulderWidth: 0.6,
  start: { heading: 0, x: 0, z: 0 },
  trafficPerKilometre: 6,
  vergeWidth: 5,
};

const hollowPineRoadLevel2 = eased([
  [200, -36, 2],
  [150, 40, 2],
  [120, 0, 6],
  [90, 0, -7],
  [150, -62, -3],
  [250, 20, -2],
  [190, 0, 0],
]);

const hollowPineRoadLevel3 = eased([
  [160, 52, 0],
  [140, -52, 0],
  [110, 0, 5],
  [85, 0, -6],
  [180, 70, -2],
  [475, 0, -6],
]);

const hollowPineRoadLevel4 = eased([
  [200, -24, 8],
  [100, 0, 6],
  [95, 0, -8],
  [130, -78, -4],
  [140, 66, 0],
  [485, 0, -2],
]);

const hollowPineRoadLevel5 = eased([
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
    { fromLevel: 3, s: 10_150 },
    { fromLevel: 4, s: 11_300 },
    { fromLevel: 5, s: 12_100 },
  ],
};
