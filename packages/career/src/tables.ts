import { bikeDefinitions } from "@racer/content/bikes";
import { byId } from "@racer/content/rows";
import { bikeIds, bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { officerFor } from "@racer/sim/cast";
import type { RegionId, RivalId } from "@racer/sim/cast";
import { byTier, difficulties } from "@racer/sim/difficulty";
import type { Tier } from "@racer/sim/difficulty";
import type { BikeClass, PacingRules, PoliceSetup } from "@racer/sim/state";
import { roadIds } from "@racer/track/road";
import type { RoadId } from "@racer/track/road";

export type { RoadId } from "@racer/track/road";
export { byTier, tiers } from "@racer/sim/difficulty";
export type { Tier } from "@racer/sim/difficulty";

export interface Road {
  readonly id: RoadId;
  readonly name: string;
  readonly region: RegionId;
  readonly regionName: string;
  readonly length: number;
}

export const roads = {
  "breakwater-run": {
    id: "breakwater-run",
    length: 8500,
    name: "Breakwater Run",
    region: "salt-coast",
    regionName: "Salt Coast",
  },
  "ridge-road": {
    id: "ridge-road",
    length: 8550,
    name: "Ridge Road",
    region: "stonepeak",
    regionName: "Stonepeak",
  },
  "slag-row": {
    id: "slag-row",
    length: 8500,
    name: "Slag Row",
    region: "lowtown",
    regionName: "Lowtown",
  },
} as const satisfies Record<RoadId, Road>;

export const roadList: readonly Road[] = roadIds.map((roadId) => roads[roadId]);

export const FINALE_ROAD: RoadId = "ridge-road";

export const ALLY: RivalId = "dee-santangelo";
export const ALLY_TIER: Tier = 2;
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

const firstTierPrizes = [
  2500, 1700, 1200, 700, 400, 250, 170, 100, 70, 50, 40, 35, 25, 15, 15,
];

const PRIZE_MULTIPLIER = { 1: 2, 2: 4.8, 3: 9.2 } as const;

const prizes = byTier((tier) =>
  firstTierPrizes.map((prize) => Math.round(prize * PRIZE_MULTIPLIER[tier]))
);

const repairBase = {
  1: 400,
  2: 1100,
  3: 2200,
} as const satisfies Record<Tier, number>;

const repairMultiplier = {
  featherweight: 1,
  heavyweight: 2,
  middleweight: 1.5,
} as const satisfies Record<BikeClass, number>;

const fines = {
  1: 400,
  2: 1500,
  3: 3000,
} as const satisfies Record<Tier, number>;

const stockTier: Readonly<Record<BikeId, Tier>> = byId(
  bikeDefinitions,
  ({ shop }) => shop.arrivesAt
);

export const pacingFor = (tier: Tier): PacingRules => difficulties[tier].pacing;

export const arrivalOf = (bikeId: BikeId): Tier => stockTier[bikeId];

export const stockArrivingAt = (tier: Tier): readonly BikeId[] =>
  bikeIds.filter((bikeId) => stockTier[bikeId] === tier);

export const prizeFor = (tier: Tier, place: number): number =>
  prizes[tier][place - 1] ?? 0;

export const repeatPrizeFor = (tier: Tier, place: number): number =>
  place <= QUALIFYING_PLACE ? prizeFor(tier, place) * REPEAT_RATE : 0;

export const repairBill = (tier: Tier, bikeId: BikeId): number =>
  repairBase[tier] * repairMultiplier[bikes[bikeId].bikeClass];

export const fineFor = (tier: Tier): number => fines[tier];

export const tradeInOf = (bikeId: BikeId): number =>
  bikeId === REPOSSESSION_BIKE
    ? 0
    : Math.round(bikes[bikeId].price * TRADE_IN_RATE);

export const creditLimitOf = (bikeId: BikeId): number =>
  bikeId === REPOSSESSION_BIKE
    ? REPOSSESSION_CREDIT_LIMIT
    : Math.round(tradeInOf(bikeId) * CREDIT_RATE);

export const policeFor = (tier: Tier, region: RegionId): PoliceSetup => {
  const { bike, ...cops } = difficulties[tier].cops;
  return {
    ...cops,
    bike: bikes[bike],
    fine: fineFor(tier),
    officer: officerFor(region).profile,
  };
};
