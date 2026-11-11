import { buyBike, sellBike } from "@racer/career/shop";
import { newCareer } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { arrivalOf, REPOSSESSION_BIKE, tradeInOf } from "@racer/career/tables";
import { bikeIds, bikes } from "@racer/sim/bikes";
import { describe, expect, it } from "vitest";

import { actionFor, shelfPick, standOf, steppedPick } from "./garage-stand.ts";
import type { GaragePick } from "./garage-stand.ts";

const rich: CareerState = { ...newCareer(7), cash: 20_000 };

const bikesOn = (career: CareerState, pick: GaragePick) =>
  standOf(career, pick).rows.map((row) => row.bikeId);

const actionOn = (career: CareerState, pick: GaragePick) =>
  actionFor(career, standOf(career, pick).row);

describe("the bike on the Garage stand", () => {
  it("opens on the rider's own bike, the only one on Yours", () => {
    const pick = shelfPick(rich, "yours");
    expect(pick.bikeId).toBe(rich.bikeId);
    expect(bikesOn(rich, pick)).toStrictEqual([rich.bikeId]);
  });

  it("puts on For sale only the bikes the rider's tier has, never their own", () => {
    const forSale = bikesOn(rich, shelfPick(rich, "forSale"));
    expect(forSale.length).toBeGreaterThan(0);
    for (const bikeId of forSale) {
      expect(arrivalOf(bikeId)).toBeLessThanOrEqual(rich.tier);
      expect(bikeId).not.toBe(rich.bikeId);
    }
    expect(
      bikesOn({ ...rich, tier: 3 }, shelfPick(rich, "forSale"))
    ).toHaveLength(bikeIds.length - 1);
  });

  it("puts every bike in the catalogue, locked ones too", () => {
    expect(bikesOn(rich, shelfPick(rich, "catalogue"))).toStrictEqual([
      ...bikeIds,
    ]);
  });

  it("steps through a shelf and wraps at both ends", () => {
    const first = shelfPick(rich, "catalogue");
    const back = steppedPick(rich, first, -1);
    expect(standOf(rich, back).place).toBe(bikeIds.length);
    expect(steppedPick(rich, back, 1)).toStrictEqual(first);
    expect(standOf(rich, steppedPick(rich, first, 1)).place).toBe(2);
  });

  it("falls back to the first bike when the picked one left the shelf", () => {
    const sold = { bikeId: rich.bikeId, shelf: "yours" } as const;
    const after = sellBike(rich);
    expect(standOf(after, sold).row.bikeId).toBe(REPOSSESSION_BIKE);
    expect(standOf(after, sold).place).toBe(1);
  });
});

describe("the action on the Garage stand", () => {
  it("sells the rider's bike for its trade-in", () => {
    expect(actionOn(rich, shelfPick(rich, "yours"))).toStrictEqual({
      cashAfter: rich.cash + tradeInOf(rich.bikeId),
      kind: "sell",
      pays: tradeInOf(rich.bikeId),
    });
    expect(sellBike(rich).cash).toBe(rich.cash + tradeInOf(rich.bikeId));
  });

  it("will not sell the Gutter Pup", () => {
    const pup = sellBike(rich);
    expect(actionOn(pup, shelfPick(pup, "yours"))).toStrictEqual({
      kind: "cantSell",
    });
  });

  it("shows the cash, the price and the price with trade-in that buying charges", () => {
    const pick = shelfPick(rich, "forSale");
    const { price } = bikes[pick.bikeId];
    const withTradeIn = price - tradeInOf(rich.bikeId);
    expect(actionOn(rich, pick)).toStrictEqual({
      cash: rich.cash,
      kind: "buy",
      leftAfter: rich.cash - withTradeIn,
      price,
      withTradeIn,
    });
    expect(buyBike(rich, pick.bikeId).cash).toBe(rich.cash - withTradeIn);
  });

  it("names the tier a locked bike arrives at", () => {
    const locked = bikeIds.find((bikeId) => arrivalOf(bikeId) > rich.tier);
    if (!locked) {
      throw new Error("Some bike arrives after tier 1.");
    }
    const action = actionOn(rich, { bikeId: locked, shelf: "catalogue" });
    expect(action.kind === "refused" && action.refusal).toBe("locked");
    expect(action.kind === "refused" && action.row.arrivesAt).toBe(
      arrivalOf(locked)
    );
  });

  it("refuses a bike the rider is short for, and still sells to a rider in debt", () => {
    const broke = { ...rich, cash: 0 };
    const dear = bikesOn(broke, shelfPick(broke, "forSale")).find(
      (bikeId) => bikes[bikeId].price > tradeInOf(broke.bikeId)
    );
    if (!dear) {
      throw new Error("Some tier 1 bike costs more than the trade-in.");
    }
    const short = actionOn(broke, { bikeId: dear, shelf: "forSale" });
    expect(short.kind === "refused" && short.refusal).toBe("short");
    const owing = { ...rich, cash: -100 };
    const debt = actionOn(owing, { bikeId: dear, shelf: "forSale" });
    expect(debt.kind === "refused" && debt.refusal).toBe("inDebt");
    expect(actionOn(owing, shelfPick(owing, "yours")).kind).toBe("sell");
  });
});
