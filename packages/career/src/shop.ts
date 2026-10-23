import { bikeIds, bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import type { BikeClass } from "@racer/sim/state";

import type { CareerState } from "./state.ts";
import {
  repairBill,
  REPOSSESSION_BIKE,
  stockLevel,
  tradeInOf,
} from "./tables.ts";
import type { Level } from "./tables.ts";

export type BuyRefusal = "closed" | "owned" | "locked" | "inDebt" | "short";

export interface ShopRow {
  readonly bikeId: BikeId;
  readonly name: string;
  readonly bikeClass: BikeClass;
  readonly price: number;
  readonly arrivesAt: Level;
  readonly owned: boolean;
  readonly leftAfter: number;
  readonly repair: number;
  readonly refusal: BuyRefusal | null;
}

export const spendingPower = (career: CareerState): number =>
  career.cash + tradeInOf(career.bikeId);

const shopClosed = (career: CareerState): boolean =>
  career.gameOver || career.activeRace !== null;

const refusalOf = (career: CareerState, bikeId: BikeId): BuyRefusal | null => {
  if (shopClosed(career)) {
    return "closed";
  }
  if (bikeId === career.bikeId) {
    return "owned";
  }
  if (stockLevel[bikeId] > career.level) {
    return "locked";
  }
  if (career.cash < 0) {
    return "inDebt";
  }
  return spendingPower(career) < bikes[bikeId].price ? "short" : null;
};

export const shopStock = (career: CareerState): readonly ShopRow[] =>
  bikeIds.map((bikeId) => ({
    arrivesAt: stockLevel[bikeId],
    bikeClass: bikes[bikeId].bikeClass,
    bikeId,
    leftAfter: spendingPower(career) - bikes[bikeId].price,
    name: bikes[bikeId].name,
    owned: bikeId === career.bikeId,
    price: bikes[bikeId].price,
    refusal: refusalOf(career, bikeId),
    repair: repairBill(career.level, bikeId),
  }));

export const canBuy = (career: CareerState, bikeId: BikeId): boolean =>
  refusalOf(career, bikeId) === null;

const riding = (career: CareerState, bikeId: BikeId): CareerState => ({
  ...career,
  bikeId,
  garage: career.garage.includes(bikeId)
    ? career.garage
    : [...career.garage, bikeId],
});

export const buyBike = (career: CareerState, bikeId: BikeId): CareerState =>
  canBuy(career, bikeId)
    ? riding(
        { ...career, cash: spendingPower(career) - bikes[bikeId].price },
        bikeId
      )
    : career;

export const canSell = (career: CareerState): boolean =>
  !shopClosed(career) && career.bikeId !== REPOSSESSION_BIKE;

export const sellBike = (career: CareerState): CareerState =>
  canSell(career)
    ? riding({ ...career, cash: spendingPower(career) }, REPOSSESSION_BIKE)
    : career;
