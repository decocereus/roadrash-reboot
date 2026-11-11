import { canSell, shopStock, spendingPower } from "@racer/career/shop";
import type { BuyRefusal, ShopRow } from "@racer/career/shop";
import type { CareerState } from "@racer/career/state";
import { tradeInOf } from "@racer/career/tables";
import type { BikeId } from "@racer/sim/bikes";

export const shelves = ["yours", "forSale", "catalogue"] as const;

export type Shelf = (typeof shelves)[number];

export interface GaragePick {
  readonly shelf: Shelf;
  readonly bikeId: BikeId;
}

type Rows = readonly [ShopRow, ...ShopRow[]];

export interface GarageStand {
  readonly rows: Rows;
  readonly row: ShopRow;
  readonly place: number;
}

export type GarageAction =
  | { readonly kind: "sell"; readonly pays: number; readonly cashAfter: number }
  | { readonly kind: "cantSell" }
  | {
      readonly kind: "buy";
      readonly cash: number;
      readonly price: number;
      readonly withTradeIn: number;
      readonly leftAfter: number;
    }
  | {
      readonly kind: "refused";
      readonly refusal: Exclude<BuyRefusal, "owned">;
      readonly row: ShopRow;
    };

const ownRow = (stock: readonly ShopRow[]): ShopRow => {
  const owned = stock.find((row) => row.owned);
  if (!owned) {
    throw new Error("The shop lists the bike the rider rides.");
  }
  return owned;
};

const onShelf = (row: ShopRow, shelf: Shelf): boolean => {
  switch (shelf) {
    case "yours": {
      return row.owned;
    }
    case "forSale": {
      return !row.owned && row.refusal !== "locked";
    }
    case "catalogue": {
      return true;
    }
    default: {
      return shelf satisfies never;
    }
  }
};

const shelfRows = (career: CareerState, shelf: Shelf): Rows => {
  const stock = shopStock(career);
  const [first, ...rest] = stock.filter((row) => onShelf(row, shelf));
  return first ? [first, ...rest] : [ownRow(stock)];
};

export const shelfPick = (career: CareerState, shelf: Shelf): GaragePick => ({
  bikeId: shelfRows(career, shelf)[0].bikeId,
  shelf,
});

export const standOf = (career: CareerState, pick: GaragePick): GarageStand => {
  const rows = shelfRows(career, pick.shelf);
  const at = rows.findIndex((row) => row.bikeId === pick.bikeId);
  const index = Math.max(at, 0);
  return { place: index + 1, row: rows[index] ?? rows[0], rows };
};

export const steppedPick = (
  career: CareerState,
  pick: GaragePick,
  by: 1 | -1
): GaragePick => {
  const { place, rows } = standOf(career, pick);
  const next = rows[(place - 1 + by + rows.length) % rows.length] ?? rows[0];
  return { bikeId: next.bikeId, shelf: pick.shelf };
};

export const actionFor = (career: CareerState, row: ShopRow): GarageAction => {
  const { refusal } = row;
  switch (refusal) {
    case null: {
      return {
        cash: career.cash,
        kind: "buy",
        leftAfter: row.leftAfter,
        price: row.price,
        withTradeIn: row.price - tradeInOf(career.bikeId),
      };
    }
    case "owned": {
      return canSell(career)
        ? {
            cashAfter: spendingPower(career),
            kind: "sell",
            pays: tradeInOf(career.bikeId),
          }
        : { kind: "cantSell" };
    }
    case "closed":
    case "inDebt":
    case "locked":
    case "short": {
      return { kind: "refused", refusal, row };
    }
    default: {
      return refusal satisfies never;
    }
  }
};
