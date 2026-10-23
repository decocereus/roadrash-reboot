import { block } from "../road.ts";
import type { Road } from "../road.ts";
import type { TrackPlan } from "../track.ts";

export const slagRow: TrackPlan = {
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
  region: "lowtown",
  roadblocks: [],
  runoffLength: 400,
  sections: [
    { climb: 0, length: 320, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: 88 },
    { climb: 0, length: 480, turnDegrees: 0 },
    { climb: 1, length: 30, turnDegrees: 0 },
    { climb: -1, length: 30, turnDegrees: 0 },
    { climb: 0, length: 440, turnDegrees: -20 },
    { climb: -5, length: 120, turnDegrees: 0 },
    { climb: 5, length: 120, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: -90 },
    { climb: 2, length: 560, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 46 },
    { climb: 0, length: 150, turnDegrees: -46 },
    { climb: 10, length: 300, turnDegrees: 0 },
    { climb: 4, length: 80, turnDegrees: 0 },
    { climb: -6, length: 80, turnDegrees: 0 },
    { climb: -8, length: 300, turnDegrees: -10 },
    { climb: 0, length: 160, turnDegrees: 90 },
    { climb: 0, length: 290, turnDegrees: 0 },
    { climb: 1.4, length: 38, turnDegrees: 0 },
    { climb: -1.4, length: 38, turnDegrees: 0 },
    { climb: 0, length: 344, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: -88 },
    { climb: 0, length: 560, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: 92 },
    { climb: 2, length: 330, turnDegrees: 0 },
    { climb: 0, length: 180, turnDegrees: 40 },
    { climb: 0, length: 160, turnDegrees: -40 },
    { climb: 8, length: 260, turnDegrees: 0 },
    { climb: 4, length: 85, turnDegrees: 0 },
    { climb: -6, length: 85, turnDegrees: 0 },
    { climb: -6, length: 300, turnDegrees: -12 },
    { climb: 0, length: 300, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: -90 },
    { climb: 0, length: 400, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 30 },
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: 88 },
    { climb: 0, length: 360, turnDegrees: 0 },
  ],
  seed: 0x5a_9c_33,
  shoulderWidth: 0.5,
  trafficPerKilometre: 8,
  vergeWidth: 6,
};

const slagRowLevel2 = block([
  [290, 0, 0],
  [150, -90, 0],
  [260, 0, -4],
  [35, 0, 1],
  [35, 0, -1],
  [200, 40, 4],
  [180, 0, 0],
]);

const slagRowLevel3 = block([
  [220, 0, 6],
  [80, 0, 4],
  [90, 0, -7],
  [200, -26, -3],
  [160, 92, 0],
  [400, 0, 0],
]);

const slagRowLevel4 = block([
  [340, 0, 0],
  [130, -88, 0],
  [160, 50, 0],
  [140, -50, 0],
  [120, 0, -5],
  [120, 0, 5],
  [140, 0, 0],
]);

const slagRowLevel5 = block([
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
