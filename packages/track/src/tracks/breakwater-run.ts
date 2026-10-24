import { eased } from "../alignment.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

const breakwaterRun: TrackPlan = {
  features: [
    {
      feature: { kind: "jump", length: 16, rise: 0.8, width: 1.4 },
      fromLevel: 1,
      id: "promenade-ramp",
      placement: "fixed",
      s: 4050,
      x: 3.6,
    },
    {
      feature: { kind: "jump", length: 16, rise: 0.8, width: 1.4 },
      fromLevel: 1,
      id: "mole-ramp",
      placement: "fixed",
      s: 5420,
      x: 3.6,
    },
  ],
  hazardsPerKilometre: 1,
  id: "breakwater-run",
  laneWidth: 3.6,
  lanesEachWay: 2,
  leadInLength: 80,
  level: 1,
  name: "Breakwater Run",
  pieces: eased([
    [240, 0, 0],
    [300, -18, 2],
    [200, 0, 6],
    [160, 34, 4],
    [120, 0, -12],
    [220, -42, -4],
    [700, 38, 0],
    [300, 0, 0],
    [140, -55, 0],
    [160, 48, 2],
    [360, 0, 8],
    [100, 0, 6],
    [100, 0, -9],
    [300, -26, -5],
    [200, 30, 0],
    [120, 0, 0],
    [40, 0, 1.4],
    [40, 0, -1.4],
    [100, 0, 0],
    [500, 0, 0],
    [260, 22, 2],
    [180, 0, 6],
    [100, 0, 5],
    [100, 0, -8],
    [240, -48, -3],
    [440, 0, 0],
    [600, 32, 0],
    [150, -58, 0],
    [200, 40, 2],
    [260, 0, 4],
    [110, 0, 5],
    [110, 0, -9],
    [300, -24, -4],
    [250, 30, 0],
    [360, 0, -2],
    [140, -46, 0],
    [300, 0, 0],
  ]),
  region: "salt-coast",
  roadblocks: [],
  runoffLength: 400,
  seed: 0xb4_7a_c1,
  shoulderWidth: 0.9,
  start: { heading: 0, x: 0, z: 0 },
  trafficPerKilometre: 5,
  vergeWidth: 7,
};

const breakwaterRunLevel2 = eased([
  [220, -20, 0],
  [180, 0, 4],
  [160, 62, 2],
  [140, -48, -2],
  [280, 0, -4],
  [170, 0, 0],
]);

const breakwaterRunLevel3 = eased([
  [320, 44, 6],
  [120, 0, 7],
  [100, 0, -9],
  [200, -70, -4],
  [240, 22, 0],
  [170, 0, 0],
]);

const breakwaterRunLevel4 = eased([
  [500, -36, 0],
  [160, 0, 0],
  [130, 84, 3],
  [160, -40, 3],
  [200, 0, -6],
]);

const breakwaterRunLevel5 = eased([
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
    { fromLevel: 3, s: 9450 },
    { fromLevel: 5, s: 12_050 },
  ],
};
