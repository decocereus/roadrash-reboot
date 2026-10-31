import { eased } from "../alignment.ts";
import { chevronRuns } from "../chevron-runs.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

export const slagRow: TrackPlan = {
  chevrons: chevronRuns["slag-row"],
  crossings: [],
  features: [
    {
      feature: { kind: "jump", length: 16, rise: 0.8, width: 1.4 },
      fromLevel: 1,
      id: "slipway-ramp",
      placement: "fixed",
      s: 4720,
      x: 3.5,
    },
    {
      feature: { kind: "jump", length: 16, rise: 0.8, width: 1.4 },
      fromLevel: 1,
      id: "bonded-ramp",
      placement: "fixed",
      s: 7280,
      x: 3.5,
    },
    {
      feature: { kind: "jump", length: 16, rise: 0.8, width: 1.4 },
      fromLevel: 4,
      id: "boulevard-ramp",
      placement: "fixed",
      s: 10_880,
      x: 3.5,
    },
  ],
  hazardsPerKilometre: 1,
  id: "slag-row",
  laneWidth: 3.5,
  lanesEachWay: 2,
  leadInLength: 80,
  level: 1,
  name: "Slag Row",
  pieces: eased([
    [320, 0, 0],
    [160, 88, 0],
    [480, 0, 0],
    [30, 0, 1],
    [30, 0, -1],
    [440, -20, 0],
    [120, 0, -5],
    [120, 0, 5],
    [160, -90, 0],
    [560, 0, 2],
    [200, 46, 0],
    [150, -46, 0],
    [300, 0, 10],
    [80, 0, 4],
    [80, 0, -6],
    [300, -10, -8],
    [160, 90, 0],
    [290, 0, 0],
    [38, 0, 1.4],
    [38, 0, -1.4],
    [344, 0, 0],
    [160, -88, 0],
    [560, 0, 0],
    [160, 92, 0],
    [330, 0, 2],
    [180, 40, 0],
    [160, -40, 0],
    [260, 0, 8],
    [85, 0, 4],
    [85, 0, -6],
    [300, -12, -6],
    [300, 0, 0],
    [160, -90, 0],
    [400, 0, 0],
    [200, 30, 0],
    [240, 0, 0],
    [160, 88, 0],
    [360, 0, 0],
  ]),
  region: "lowtown",
  roadblocks: [],
  runoffLength: 400,
  seed: 0x5a_9c_33,
  shoulderWidth: 0.5,
  start: { heading: 0, x: 0, z: 0 },
  trafficPerKilometre: 8,
  vergeWidth: 6,
};

const slagRowLevel2 = eased([
  [290, 0, 0],
  [150, -90, 0],
  [260, 0, -4],
  [35, 0, 1],
  [35, 0, -1],
  [200, 40, 4],
  [180, 0, 0],
]);

const slagRowLevel3 = eased([
  [220, 0, 6],
  [80, 0, 4],
  [90, 0, -7],
  [200, -26, -3],
  [160, 92, 0],
  [400, 0, 0],
]);

const slagRowLevel4 = eased([
  [340, 0, 0],
  [130, -88, 0],
  [160, 50, 0],
  [140, -50, 0],
  [120, 0, -5],
  [120, 0, 5],
  [140, 0, 0],
]);

const slagRowLevel5 = eased([
  [300, 0, 8],
  [90, 0, 5],
  [100, 0, -9],
  [220, -12, -4],
  [150, 95, 0],
  [150, -40, 0],
  [140, 0, 0],
]);

export const slagRowRoad: Road = {
  blocks: [slagRowLevel2, slagRowLevel3, slagRowLevel4, slagRowLevel5],
  id: "slag-row",
  plan: slagRow,
  roadblockSpots: [
    { fromLevel: 3, s: 750 },
    { fromLevel: 3, s: 2150 },
    { fromLevel: 3, s: 10_650 },
  ],
};
