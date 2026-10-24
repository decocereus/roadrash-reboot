import { describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
import {
  crashOut,
  enter,
  lastOf,
  ledgerOf,
  wreckTimes,
} from "./career-fixtures.ts";
import { outcomeOf } from "./outcome.ts";
import { billConsequence, settleRace, startRace } from "./settle.ts";
import { buyBike, canBuy, sellBike } from "./shop.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";

describe("going broke", () => {
  it("three wrecks in debt take the Wren and leave the player on the Gutter Pup with the remainder", () => {
    const inDebt = lastOf(wreckTimes(newCareer(1), 4)).career;
    const wrecks = wreckTimes(inDebt, 3);
    expect(inDebt.cash).toBe(-100);
    expect(
      wrecks.map((settlement) => [
        settlement.career.cash,
        settlement.career.bikeId,
      ])
    ).toStrictEqual([
      [-500, "halden-wren-400"],
      [-900, "halden-wren-400"],
      [500, "gutter-pup-250"],
    ]);
    expect(ledgerOf(lastOf(wrecks))).toMatchObject({
      cashAfter: 500,
      gameOver: false,
      repair: 400,
      repossessed: { bikeId: "halden-wren-400", tradeIn: 1800 },
    });
    expect(lastOf(wrecks).career.board[0]).toStrictEqual({
      bikeId: "halden-wren-400",
      kind: "repossessed",
    });
  });

  it("owing more than $750 on the Gutter Pup ends the career and no more races start", () => {
    const onThePup = lastOf(wreckTimes(newCareer(1), 7)).career;
    const wrecks = wreckTimes(onThePup, 4);
    const over = lastOf(wrecks).career;
    expect(
      wrecks.map((settlement) => [
        settlement.career.cash,
        settlement.career.gameOver,
      ])
    ).toStrictEqual([
      [100, false],
      [-300, false],
      [-700, false],
      [-1100, true],
    ]);
    expect(startRace(recordedRules, over, "slag-row", 1)).toMatchObject({
      reason: "gameOver",
      started: false,
    });
    expect(canBuy(recordedRules, over, "gutter-pup-250")).toBeFalsy();
  });

  it("a Wren rider $800 in debt who wrecks at level 5 loses the bike and the career in one step", () => {
    const career: CareerState = { ...newCareer(1), cash: -800, level: 5 };
    const ledger = ledgerOf(lastOf(wreckTimes(career, 1)));
    expect(ledger).toMatchObject({
      cashAfter: -1200,
      gameOver: true,
      repair: 2200,
      repossessed: { bikeId: "halden-wren-400", tradeIn: 1800 },
    });
  });

  it("the garage does not sell to a player in debt, but the player can sell down to the Pup", () => {
    const inDebt = lastOf(wreckTimes(newCareer(1), 4)).career;
    const sold = sellBike(inDebt);
    expect(canBuy(recordedRules, inDebt, "gutter-pup-250")).toBeFalsy();
    expect(buyBike(recordedRules, inDebt, "gutter-pup-250")).toBe(inDebt);
    expect([sold.cash, sold.bikeId]).toStrictEqual([1700, "gutter-pup-250"]);
  });
});

describe("the rewarded ad", () => {
  it("halves a repair bill, which can be what keeps the bike", () => {
    const inDebt: CareerState = { ...newCareer(1), cash: -600 };
    const race = enter(inDebt, "slag-row");
    crashOut(race);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const full = ledgerOf(settleRace(recordedRules, race.career, outcome));
    const half = ledgerOf(
      settleRace(recordedRules, race.career, outcome, "half")
    );
    expect(outcome.result).toBe("wrecked");
    expect([
      full.repair,
      full.cashAfter,
      full.repossessed?.bikeId,
    ]).toStrictEqual([400, 800, "halden-wren-400"]);
    expect([
      half.repair,
      half.repairHalved,
      half.cashAfter,
      half.repossessed,
    ]).toStrictEqual([200, true, -800, null]);
  });

  it("is not offered for a quit, so the bill stays whole", () => {
    const start = startRace(recordedRules, newCareer(1), "slag-row", 1);
    const race = enter(newCareer(1), "slag-row", 1);
    const quit = outcomeOf(race.state, race.setup, race.log);
    expect(
      ledgerOf(settleRace(recordedRules, start.career, quit, "half"))
    ).toMatchObject({
      repair: 400,
      repairHalved: false,
      result: "quit",
    });
  });

  it("the screens can tell before the bill lands whether it takes the bike or the career", () => {
    const fresh = newCareer(1);
    const onThePup = sellBike(fresh);
    expect([
      billConsequence(fresh, 2400),
      billConsequence(fresh, 2401),
      billConsequence(fresh, 4051),
      billConsequence(onThePup, 4050),
      billConsequence(onThePup, 4051),
    ]).toStrictEqual([
      "covered",
      "repossession",
      "gameOver",
      "covered",
      "gameOver",
    ]);
  });
});
