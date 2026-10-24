import { describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
import {
  decent,
  enter,
  ledgerOf,
  play,
  playAll,
  seasonAt,
  settle,
  sprint,
} from "./career-fixtures.ts";
import { fieldFor, roadsFor } from "./field.ts";
import { levelAfter, levelsOf } from "./rules.ts";
import type { RaceRules } from "./rules.ts";
import { parseCareer, serialiseCareer } from "./save.ts";
import { startRace } from "./settle.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";
import { roadList } from "./tables.ts";

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
});
