import { bikeIds, bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { officerFor } from "@racer/sim/cast";
import type { RegionId, RivalId } from "@racer/sim/cast";
import type { BikeClass, PacingRules, PoliceSetup } from "@racer/sim/state";
import { roadIds } from "@racer/track/road";
import type { RoadId, RoadLevel } from "@racer/track/road";

import { climbOf, levelReaching, rungsOf, rungsWithin } from "./rules.ts";
import type { RaceRules } from "./rules.ts";

export type { RoadId } from "@racer/track/road";
export { roadLevels as levels } from "@racer/track/road";

export type Level = RoadLevel;

export const byLevel = <Value>(make: (level: Level) => Value) => ({
  1: make(1),
  2: make(2),
  3: make(3),
  4: make(4),
  5: make(5),
});

export interface Road {
  readonly id: RoadId;
  readonly name: string;
  readonly region: RegionId;
  readonly regionName: string;
  readonly lengths: Record<Level, number>;
}

export const roads = {
  "breakwater-run": {
    id: "breakwater-run",
    lengths: { 1: 8500, 2: 9650, 3: 10_800, 4: 11_950, 5: 13_100 },
    name: "Breakwater Run",
    region: "salt-coast",
    regionName: "Salt Coast",
  },
  "cinder-wash": {
    id: "cinder-wash",
    lengths: { 1: 8850, 2: 10_000, 3: 11_150, 4: 12_300, 5: 13_450 },
    name: "Cinder Wash",
    region: "cinder-flats",
    regionName: "Cinder Flats",
  },
  "hollow-pine-road": {
    id: "hollow-pine-road",
    lengths: { 1: 8050, 2: 9200, 3: 10_350, 4: 11_500, 5: 12_650 },
    name: "Hollow Pine Road",
    region: "kettle-woods",
    regionName: "Kettle Woods",
  },
  "ridge-road": {
    id: "ridge-road",
    lengths: { 1: 8550, 2: 9700, 3: 10_850, 4: 12_000, 5: 13_150 },
    name: "Ridge Road",
    region: "stonepeak",
    regionName: "Stonepeak",
  },
  "slag-row": {
    id: "slag-row",
    lengths: { 1: 8500, 2: 9650, 3: 10_800, 4: 11_950, 5: 13_100 },
    name: "Slag Row",
    region: "lowtown",
    regionName: "Lowtown",
  },
} as const satisfies Record<RoadId, Road>;

export const roadList: readonly Road[] = roadIds.map((roadId) => roads[roadId]);

export const FINALE_ROAD: RoadId = "ridge-road";
export const ENVELOPE_ROAD: RoadId = "breakwater-run";
export const ENVELOPE_LEVEL: Level = 2;
export const ENVELOPE_RIVAL: RivalId = "tristan-lux";
export const ENVELOPE_PAYMENT = 1500;
export const ENVELOPE_CLAWBACK = 2000;

export const ALLY: RivalId = "dee-santangelo";
export const ALLY_RUNG: Level = 3;
export const ALLY_BREAKING_KNOCKDOWNS = 2;

export const CHAMPION: RivalId = "juno-kade";
export const CHAMPION_STAND_IN: RivalId = "ruth-ann-bixby";
export const FINALE_AGGRESSION = 0.9;

export const QUALIFYING_PLACE = 3;

export const STARTING_CASH = 1500;
export const STARTING_BIKE: BikeId = "halden-wren-400";
export const REPOSSESSION_BIKE: BikeId = "gutter-pup-250";
export const REPOSSESSION_CREDIT_LIMIT = 750;
const TRADE_IN_RATE = 0.6;
const CREDIT_RATE = 0.5;
const REPEAT_RATE = 0.5;
export const AD_REPAIR_RATE = 0.5;

const levelOnePrizes = [
  1500, 1000, 700, 400, 250, 150, 100, 50, 40, 30, 25, 20, 15, 10, 10,
];

const PRIZE_MULTIPLIER = { 1: 1, 2: 1.6, 3: 2.4, 4: 3.4, 5: 4.6 } as const;

const prizes = byLevel((level) =>
  levelOnePrizes.map((prize) => Math.round(prize * PRIZE_MULTIPLIER[level]))
);

const repairBase = {
  1: 400,
  2: 700,
  3: 1100,
  4: 1600,
  5: 2200,
} as const satisfies Record<Level, number>;

const repairMultiplier = {
  featherweight: 1,
  heavyweight: 2,
  middleweight: 1.5,
} as const satisfies Record<BikeClass, number>;

const fines = {
  1: 400,
  2: 900,
  3: 1500,
  4: 2200,
  5: 3000,
} as const satisfies Record<Level, number>;

interface PoliceLevel {
  readonly topSpeed: number;
  readonly sightRange: number;
  readonly beat: number;
  readonly bike: BikeId;
}

const policeLevels = {
  1: {
    beat: 6000,
    bike: "ostra-sesta-600",
    sightRange: 40,
    topSpeed: 49,
  },
  2: {
    beat: 5000,
    bike: "ostra-sesta-600",
    sightRange: 40,
    topSpeed: 52,
  },
  3: {
    beat: 1800,
    bike: "ostra-sesta-600",
    sightRange: 45,
    topSpeed: 60,
  },
  4: {
    beat: 1500,
    bike: "halden-meridian-900",
    sightRange: 50,
    topSpeed: 64,
  },
  5: {
    beat: 1200,
    bike: "ostra-nera-1000",
    sightRange: 60,
    topSpeed: 69,
  },
} as const satisfies Record<Level, PoliceLevel>;

const pacingLevels = {
  1: { catchUp: 0.08, leadEase: 0.22 },
  2: { catchUp: 0.07, leadEase: 0.2 },
  3: { catchUp: 0.06, leadEase: 0.18 },
  4: { catchUp: 0.05, leadEase: 0.16 },
  5: { catchUp: 0.04, leadEase: 0.14 },
} as const satisfies Record<Level, PacingRules>;

const stockLevel = {
  "brack-anvil-1100": 4,
  "brack-stoker-800": 2,
  "gutter-pup-250": 1,
  "halden-kite-500": 1,
  "halden-meridian-900": 3,
  "halden-wren-400": 1,
  "ostra-nera-1000": 5,
  "ostra-sesta-600": 1,
  "ostra-sette-750": 2,
} as const satisfies Record<BikeId, Level>;

const fieldRung = (rules: RaceRules, level: Level): Level =>
  rungsOf(rules, level).highest;

export const pacingFor = (rules: RaceRules, level: Level): PacingRules =>
  pacingLevels[fieldRung(rules, level)];

export const arrivalOf = (rules: RaceRules, bikeId: BikeId): Level =>
  levelReaching(rules, stockLevel[bikeId]);

export const stockArrivingAt = (
  rules: RaceRules,
  level: Level
): readonly BikeId[] => {
  const arriving = rungsWithin(rungsOf(rules, level));
  return bikeIds.filter((bikeId) => arriving.includes(stockLevel[bikeId]));
};

export const prizeFor = (
  rules: RaceRules,
  level: Level,
  place: number
): number =>
  (prizes[fieldRung(rules, level)][place - 1] ?? 0) * climbOf(rules, level);

export const repeatPrizeFor = (
  rules: RaceRules,
  level: Level,
  place: number
): number =>
  place <= QUALIFYING_PLACE ? prizeFor(rules, level, place) * REPEAT_RATE : 0;

export const repairBill = (
  rules: RaceRules,
  level: Level,
  bikeId: BikeId
): number =>
  repairBase[fieldRung(rules, level)] *
  repairMultiplier[bikes[bikeId].bikeClass];

export const fineFor = (rules: RaceRules, level: Level): number =>
  fines[fieldRung(rules, level)];

export const tradeInOf = (bikeId: BikeId): number =>
  bikeId === REPOSSESSION_BIKE
    ? 0
    : Math.round(bikes[bikeId].price * TRADE_IN_RATE);

export const creditLimitOf = (bikeId: BikeId): number =>
  bikeId === REPOSSESSION_BIKE
    ? REPOSSESSION_CREDIT_LIMIT
    : Math.round(tradeInOf(bikeId) * CREDIT_RATE);

export const policeFor = (
  rules: RaceRules,
  level: Level,
  region: RegionId
): PoliceSetup => {
  const police = policeLevels[fieldRung(rules, level)];
  return {
    beat: police.beat,
    bike: bikes[police.bike],
    count: rules.police[level],
    fine: fineFor(rules, level),
    officer: officerFor(region).profile,
    sightRange: police.sightRange,
    topSpeed: police.topSpeed,
  };
};
