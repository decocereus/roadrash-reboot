import { bikeIds } from "@racer/sim/bikes";
import { describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
import {
  decent,
  decentSeason,
  enter,
  ledgerOf,
  play,
  playAll,
  road,
  seasonAt,
  seasonsOf,
  settle,
  sprint,
  weakSeason,
} from "./career-fixtures.ts";
import { fieldFor, roadsFor, setupFor } from "./field.ts";
import { levelAfter, levelsOf } from "./rules.ts";
import type { RaceRules } from "./rules.ts";
import { parseCareer, serialiseCareer } from "./save.ts";
import { startRace } from "./settle.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";
import { chapterOf } from "./story.ts";
import { policeFor, prizeFor, roadList, stockArrivingAt } from "./tables.ts";

const served: RaceRules = { ...recordedRules, fieldSize: 10, levelCount: 3 };

const qualifyOn = (career: CareerState, roads: typeof roadList): CareerState =>
  playAll(
    career,
    roads.map((entry) => ({ place: 3, roadId: entry.id })),
    served
  );

describe("ten racers over three levels", () => {
  it("draws nine different rivals for every road at every level", () => {
    const fields = levelsOf(served).flatMap((level) =>
      roadList.map((entry) => fieldFor(served, entry.id, level, 5))
    );
    expect(
      fields.map((field) => [field.length, new Set(field).size])
    ).toStrictEqual(fields.map(() => [9, 9]));
  });

  it("starts each race with ten racers and pays a winner ten points", () => {
    const race = enter(newCareer(11), "slag-row", 3, served);
    sprint(race, 1);
    const won = settle(race);
    expect([
      race.setup.field.length + 1,
      won.career.season.player.points,
    ]).toStrictEqual([10, 10]);
  });

  it("moves up twice, opens the Long Ridge at level 3, and ends the season there", () => {
    const two = qualifyOn(newCareer(11), roadList);
    const three = qualifyOn(two, roadList);
    const four = qualifyOn(
      three,
      roadList.filter((entry) => entry.id !== "ridge-road")
    );
    const won = play(four, { place: 1, roadId: "ridge-road" }, 1, served);
    expect([
      two.level,
      three.level,
      levelAfter(served, three.level),
      roadsFor(served, three).finaleOpen,
      roadsFor(served, four).finaleOpen,
      ledgerOf(won).ending,
      won.career.level,
    ]).toStrictEqual([2, 3, null, false, true, "clean-crown", 3]);
    expect(startRace(served, won.career, "slag-row", 1)).toMatchObject({
      reason: "seasonOver",
      started: false,
    });
  });

  it("refuses a save made at a level the rules no longer hold", () => {
    const text = serialiseCareer(seasonAt(decent, 4).start);
    expect([
      parseCareer(recordedRules, text).ok,
      parseCareer(served, text),
    ]).toStrictEqual([
      true,
      { error: { field: "level", kind: "invalid" }, ok: false },
    ]);
  });

  it("stocks every bike at some level and puts every bike under some rival", () => {
    const ridden = new Set(
      levelsOf(served).flatMap((level) =>
        roadList.flatMap((entry) =>
          [1, 2, 3, 4].flatMap((seed) =>
            setupFor(
              served,
              { ...newCareer(seed), level },
              entry.id,
              seed,
              road
            ).rivals.map((rival) => rival.bike.id)
          )
        )
      )
    );
    expect(
      levelsOf(served).map((level) => stockArrivingAt(served, level))
    ).toStrictEqual([
      [
        "gutter-pup-250",
        "halden-wren-400",
        "halden-kite-500",
        "ostra-sesta-600",
      ],
      ["ostra-sette-750", "brack-stoker-800", "halden-meridian-900"],
      ["brack-anvil-1100", "ostra-nera-1000"],
    ]);
    expect(bikeIds.filter((bikeId) => !ridden.has(bikeId))).toStrictEqual([]);
  });

  it("pays each level for the two rungs of bike it climbs, and bills it at the rung its field rides", () => {
    expect(
      levelsOf(served).map((level) => [
        [1, 2, 3, 10].map((place) => prizeFor(served, level, place)),
        policeFor(served, level, "lowtown").fine,
      ])
    ).toStrictEqual([
      [[5000, 3400, 2400, 100], 400],
      [[12_000, 8160, 5760, 240], 1500],
      [[23_000, 15_640, 11_040, 460], 3000],
    ]);
    expect(prizeFor(recordedRules, 5, 1)).toBe(11_500);
  });

  it("lets the decent and the weak player buy one bike a level, the Sesta and then the Meridian", () => {
    const purchases = ["ostra-sesta-600", "halden-meridian-900"] as const;
    const cash = (steps: typeof decentSeason) =>
      seasonsOf(steps, purchases, served).map((season) => [
        season.end.bikeId,
        season.start.cash,
        season.end.cash,
      ]);
    expect(cash(decentSeason)).toStrictEqual([
      ["halden-wren-400", 1500, 9300],
      ["ostra-sesta-600", 3100, 20_590],
      ["halden-meridian-900", 6890, 39_050],
    ]);
    expect(cash(weakSeason)).toStrictEqual([
      ["halden-wren-400", 1500, 8920],
      ["ostra-sesta-600", 2720, 19_148],
      ["halden-meridian-900", 5448, 34_460],
    ]);
  });

  it("folds the last two chapters into level 3, the Long Ridge", () => {
    expect(
      levelsOf(served).map((level) => chapterOf(served, level).name)
    ).toStrictEqual(["New Meat", "Dee's Tip", "The Long Ridge"]);
    expect(chapterOf(served, 3).note).toContain("Ridge Road");
  });
});
