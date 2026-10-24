import { describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
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
import { buyBike, canBuy } from "./shop.ts";
import { newCareer } from "./state.ts";

const cashAt = (seasons: readonly Season[]) =>
  seasons.map((season) => [season.start.cash, season.end.cash]);

describe("the economy", () => {
  it("a decent level-1 season ends with the $4,900 of the worked example and moves up", () => {
    const { end } = seasonAt(decent, 1);
    expect({
      bike: end.bikeId,
      cash: end.cash,
      level: end.level,
      record: end.record,
    }).toStrictEqual({
      bike: "halden-wren-400",
      cash: 4900,
      level: 2,
      record: {
        busts: 1,
        earnings: 4200,
        knockdowns: 0,
        podiums: 5,
        starts: 8,
        wins: 0,
        wrecks: 1,
      },
    });
  });

  it("the decent player buys one bike per level and ends each level with the cash in the pacing table", () => {
    expect(cashAt(decent)).toStrictEqual([
      [1500, 4900],
      [1700, 6820],
      [1820, 8750],
      [2550, 12_230],
      [330, 12_250],
    ]);
    expect(decent.map((season) => season.start.bikeId)).toStrictEqual([
      "halden-wren-400",
      "halden-kite-500",
      "ostra-sesta-600",
      "ostra-sette-750",
      "halden-meridian-900",
    ]);
  });

  it("a weak level-1 season of five thirds, five sevenths, and two wrecks ends with $4,700", () => {
    const { end } = seasonAt(weak, 1);
    expect([end.cash, end.level, end.record.starts]).toStrictEqual([
      4700, 2, 12,
    ]);
  });

  it("the weak player still finishes the season, on the Sette, with the cash in the weak table", () => {
    expect(cashAt(weak)).toStrictEqual([
      [1500, 4700],
      [1500, 6500],
      [1500, 7800],
      [1600, 10_400],
      [10_400, 22_200],
    ]);
    const last = seasonAt(weak, 5);
    expect(
      canBuy(recordedRules, seasonAt(weak, 4).end, "halden-meridian-900")
    ).toBeFalsy();
    expect([last.end.bikeId, last.end.story.ending]).toStrictEqual([
      "ostra-sette-750",
      "runner-up",
    ]);
  });

  it("two wrecks before the first prize put the weak player in debt inside the credit limit at levels 3 and 4", () => {
    const afterTwoWrecks = ([3, 4] as const).map((level) => {
      const career = playAll(
        seasonAt(weak, level).start,
        weakSeason.slice(0, 2)
      );
      return [career.cash, career.bikeId, career.gameOver];
    });
    expect(afterTwoWrecks).toStrictEqual([
      [-1800, "ostra-sesta-600", false],
      [-3200, "ostra-sette-750", false],
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
    ]).toStrictEqual([700, 750, false]);
  });

  it("a place outside the top three on a qualified road pays nothing, and the same place on a new road pays in full", () => {
    const qualified = play(newCareer(1), {
      place: 2,
      roadId: "slag-row",
    }).career;
    const repeat = ledgerOf(play(qualified, { place: 5, roadId: "slag-row" }));
    const fresh = ledgerOf(
      play(qualified, { place: 5, roadId: "cinder-wash" })
    );
    expect([repeat.prize, repeat.cashAfter, fresh.prize]).toStrictEqual([
      0, 2500, 250,
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
    const onSesta = buyBike(
      recordedRules,
      { ...qualified, cash: 9000 },
      "ostra-sesta-600"
    );
    const wreck = ledgerOf(
      play(onSesta, { ends: "wrecked", roadId: "slag-row" })
    );
    expect([bust.fine, bust.prize, wreck.repair]).toStrictEqual([400, 0, 600]);
  });
});
