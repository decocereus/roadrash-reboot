import { describe, expect, it } from "vitest";

import {
  decent,
  ledgerOf,
  play,
  playAll,
  seasonAt,
  weak,
  weakSeason,
} from "./career-fixtures.ts";
import type { Season } from "./career-fixtures.ts";
import { buyBike } from "./shop.ts";
import { newCareer } from "./state.ts";

const cashAt = (seasons: readonly Season[]) =>
  seasons.map((season) => [season.start.cash, season.end.cash]);

describe("the economy", () => {
  it("a decent tier-1 season ends with $9,300 and moves up", () => {
    const { end } = seasonAt(decent, 1);
    expect({
      bike: end.bikeId,
      cash: end.cash,
      record: end.record,
      tier: end.tier,
    }).toStrictEqual({
      bike: "halden-wren-400",
      cash: 9300,
      record: {
        busts: 1,
        earnings: 8600,
        knockdowns: 0,
        podiums: 3,
        starts: 6,
        wins: 0,
        wrecks: 1,
      },
      tier: 2,
    });
  });

  it("the decent player buys one bike per tier and ends each tier with the cash in the pacing table", () => {
    expect(cashAt(decent)).toStrictEqual([
      [1500, 9300],
      [3100, 20_590],
      [6890, 39_050],
    ]);
    expect(decent.map((season) => season.start.bikeId)).toStrictEqual([
      "halden-wren-400",
      "ostra-sesta-600",
      "halden-meridian-900",
    ]);
  });

  it("a weak tier-1 season of three thirds, three sevenths, and two wrecks ends with $8,920", () => {
    const { end } = seasonAt(weak, 1);
    expect([end.cash, end.tier, end.record.starts]).toStrictEqual([8920, 2, 8]);
  });

  it("the weak player still finishes the season, on the Meridian, with the cash in the weak table", () => {
    expect(cashAt(weak)).toStrictEqual([
      [1500, 8920],
      [2720, 19_148],
      [5448, 34_460],
    ]);
    const last = seasonAt(weak, 3);
    expect([last.end.bikeId, last.end.story.ending]).toStrictEqual([
      "halden-meridian-900",
      "runner-up",
    ]);
  });

  it("two wrecks before the first prize put the weak player in debt inside the credit limit at tiers 2 and 3", () => {
    const afterTwoWrecks = ([2, 3] as const).map((tier) => {
      const career = playAll(
        seasonAt(weak, tier).start,
        weakSeason.slice(0, 2)
      );
      return [career.cash, career.bikeId, career.gameOver];
    });
    expect(afterTwoWrecks).toStrictEqual([
      [-580, "ostra-sesta-600", false],
      [-3352, "halden-meridian-900", false],
    ]);
  });

  it("a repeat run on a qualified road pays half for a top-three place", () => {
    const qualified = play(newCareer(1), { place: 3, roadId: "slag-row" });
    const repeat = ledgerOf(
      play(qualified.career, { place: 1, roadId: "slag-row" })
    );
    expect([
      ledgerOf(qualified).prize,
      repeat.prize,
      repeat.qualified,
    ]).toStrictEqual([2400, 2500, false]);
  });

  it("a place outside the top three on a qualified road pays nothing, and the same place on a new road pays in full", () => {
    const qualified = play(newCareer(1), {
      place: 2,
      roadId: "slag-row",
    }).career;
    const repeat = ledgerOf(play(qualified, { place: 5, roadId: "slag-row" }));
    const fresh = ledgerOf(
      play(qualified, { place: 5, roadId: "breakwater-run" })
    );
    expect([repeat.prize, repeat.cashAfter, fresh.prize]).toStrictEqual([
      0, 4900, 800,
    ]);
  });

  it("a bust is charged in full on a qualified road and a wreck costs the class of the bike ridden", () => {
    const qualified = play(newCareer(1), {
      place: 1,
      roadId: "slag-row",
    }).career;
    const bust = ledgerOf(
      play(qualified, { ends: "busted", roadId: "slag-row" })
    );
    const onSesta = buyBike({ ...qualified, cash: 9000 }, "ostra-sesta-600");
    const wreck = ledgerOf(
      play(onSesta, { ends: "wrecked", roadId: "slag-row" })
    );
    expect([bust.fine, bust.prize, wreck.repair]).toStrictEqual([400, 0, 600]);
  });
});
