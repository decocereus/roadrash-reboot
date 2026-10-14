import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { officerFor } from "@racer/sim/cast";
import type { RegionId, RivalId } from "@racer/sim/cast";
import type { BikeClass, PacingRules, PoliceSetup } from "@racer/sim/state";
import type { RoadId, RoadLevel } from "@racer/track/road";

export type { RoadId } from "@racer/track/road";

export type Level = RoadLevel;

export const levels: readonly Level[] = [1, 2, 3, 4, 5];

export const FIRST_LEVEL: Level = 1;
export const LAST_LEVEL: Level = 5;

export const levelAfter = (level: Level): Level =>
  levels.find((candidate) => candidate === level + 1) ?? LAST_LEVEL;

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

export const roadList: readonly Road[] = [
  roads["breakwater-run"],
  roads["cinder-wash"],
  roads["hollow-pine-road"],
  roads["slag-row"],
  roads["ridge-road"],
];

export const FINALE_ROAD: RoadId = "ridge-road";
export const ENVELOPE_ROAD: RoadId = "breakwater-run";
export const ENVELOPE_LEVEL: Level = 2;
export const ENVELOPE_RIVAL: RivalId = "tristan-lux";
export const ENVELOPE_PAYMENT = 1500;
export const ENVELOPE_CLAWBACK = 2000;

export const ALLY: RivalId = "dee-santangelo";
export const ALLY_LEVEL: Level = 3;
export const ALLY_BREAKING_KNOCKDOWNS = 2;

export const CHAMPION: RivalId = "juno-kade";
export const CHAMPION_STAND_IN: RivalId = "ruth-ann-bixby";
export const FINALE_AGGRESSION = 0.9;

export const RIVALS_PER_RACE = 14;
export const FIELD_SIZE = RIVALS_PER_RACE + 1;
export const QUALIFYING_PLACE = 3;

export const STARTING_CASH = 1500;
export const STARTING_BIKE: BikeId = "halden-wren-400";
export const REPOSSESSION_BIKE: BikeId = "gutter-pup-250";
export const REPOSSESSION_CREDIT_LIMIT = 750;
export const TRADE_IN_RATE = 0.6;
export const CREDIT_RATE = 0.5;
export const REPEAT_RATE = 0.5;
export const AD_REPAIR_RATE = 0.5;

const levelOnePrizes = [
  1500, 1000, 700, 400, 250, 150, 100, 50, 40, 30, 25, 20, 15, 10, 10,
];

const PRIZE_MULTIPLIER = { 1: 1, 2: 1.6, 3: 2.4, 4: 3.4, 5: 4.6 } as const;

export const prizes = byLevel((level) =>
  levelOnePrizes.map((prize) => Math.round(prize * PRIZE_MULTIPLIER[level]))
);

export const repairBase = {
  1: 400,
  2: 700,
  3: 1100,
  4: 1600,
  5: 2200,
} as const satisfies Record<Level, number>;

export const repairMultiplier = {
  featherweight: 1,
  heavyweight: 2,
  middleweight: 1.5,
} as const satisfies Record<BikeClass, number>;

export const fines = {
  1: 500,
  2: 900,
  3: 1500,
  4: 2200,
  5: 3000,
} as const satisfies Record<Level, number>;

export interface PoliceLevel {
  readonly count: number;
  readonly topSpeed: number;
  readonly sightRange: number;
  readonly beat: number;
  readonly bike: BikeId;
}

export const policeLevels = {
  1: {
    beat: 6000,
    bike: "ostra-sesta-600",
    count: 1,
    sightRange: 40,
    topSpeed: 41,
  },
  2: {
    beat: 5000,
    bike: "ostra-sesta-600",
    count: 2,
    sightRange: 40,
    topSpeed: 44,
  },
  3: {
    beat: 1800,
    bike: "ostra-sesta-600",
    count: 3,
    sightRange: 45,
    topSpeed: 48,
  },
  4: {
    beat: 1500,
    bike: "halden-meridian-900",
    count: 4,
    sightRange: 50,
    topSpeed: 51,
  },
  5: {
    beat: 1200,
    bike: "ostra-nera-1000",
    count: 5,
    sightRange: 60,
    topSpeed: 54,
  },
} as const satisfies Record<Level, PoliceLevel>;

export const pacingLevels = {
  1: { catchUp: 0.08, leadEase: 0.22 },
  2: { catchUp: 0.07, leadEase: 0.2 },
  3: { catchUp: 0.06, leadEase: 0.18 },
  4: { catchUp: 0.05, leadEase: 0.16 },
  5: { catchUp: 0.04, leadEase: 0.14 },
} as const satisfies Record<Level, PacingRules>;

export const catalogue: readonly BikeId[] = [
  "gutter-pup-250",
  "halden-wren-400",
  "halden-kite-500",
  "ostra-sesta-600",
  "ostra-sette-750",
  "brack-stoker-800",
  "halden-meridian-900",
  "brack-anvil-1100",
  "ostra-nera-1000",
];

export const stockLevel = {
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

export const stockArrivingAt = (level: Level): readonly BikeId[] =>
  catalogue.filter((bikeId) => stockLevel[bikeId] === level);

export const prizeFor = (level: Level, place: number): number =>
  prizes[level][place - 1] ?? 0;

export const repeatPrizeFor = (level: Level, place: number): number =>
  place <= QUALIFYING_PLACE ? prizeFor(level, place) * REPEAT_RATE : 0;

export const repairBill = (level: Level, bikeId: BikeId): number =>
  repairBase[level] * repairMultiplier[bikes[bikeId].bikeClass];

export const tradeInOf = (bikeId: BikeId): number =>
  bikeId === REPOSSESSION_BIKE
    ? 0
    : Math.round(bikes[bikeId].price * TRADE_IN_RATE);

export const creditLimitOf = (bikeId: BikeId): number =>
  bikeId === REPOSSESSION_BIKE
    ? REPOSSESSION_CREDIT_LIMIT
    : Math.round(tradeInOf(bikeId) * CREDIT_RATE);

export const policeFor = (level: Level, region: RegionId): PoliceSetup => ({
  beat: policeLevels[level].beat,
  bike: bikes[policeLevels[level].bike],
  count: policeLevels[level].count,
  fine: fines[level],
  officer: officerFor(region).profile,
  sightRange: policeLevels[level].sightRange,
  topSpeed: policeLevels[level].topSpeed,
});
