import { describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
import {
  decent,
  enter,
  knockDown,
  ledgerOf,
  play,
  playAll,
  rivalIn,
  road,
  seasonAt,
  settle,
  sprint,
} from "./career-fixtures.ts";
import { roadsFor, setupFor } from "./field.ts";
import { startRace } from "./settle.ts";
import { shopStock } from "./shop.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";
import { acceptEnvelope, refuseEnvelope, storyBeat } from "./story.ts";
import { roadList } from "./tables.ts";

describe("moving up", () => {
  it("the fifth qualification moves the player up and unlocks the level's bikes", () => {
    const four = playAll(
      newCareer(5),
      roadList.slice(0, 4).map((entry) => ({ place: 3, roadId: entry.id }))
    );
    const fifth = play(four, { place: 1, roadId: "ridge-road" });
    const lockedBefore = shopStock(four)
      .filter((row) => row.refusal === "locked")
      .map((row) => row.bikeId);
    const lockedAfter = shopStock(fifth.career)
      .filter((row) => row.refusal === "locked")
      .map((row) => row.bikeId);
    expect([
      four.level,
      roadsFor(recordedRules, four).qualifiedCount,
    ]).toStrictEqual([1, 4]);
    expect(ledgerOf(fifth)).toMatchObject({
      levelUp: {
        bikes: ["ostra-sette-750", "brack-stoker-800"],
        level: 2,
      },
      qualified: true,
      qualifiedCount: 5,
    });
    expect(lockedBefore).toContain("ostra-sette-750");
    expect(lockedAfter).toStrictEqual([
      "halden-meridian-900",
      "brack-anvil-1100",
      "ostra-nera-1000",
    ]);
    expect(roadsFor(recordedRules, fifth.career)).toMatchObject({
      level: 2,
      next: "breakwater-run",
      qualifiedCount: 0,
    });
  });

  it("the Long Ridge is closed until the other four level-5 roads are qualified, and a top three there ends the season", () => {
    const { start } = seasonAt(decent, 5);
    const three = playAll(
      start,
      roadList.slice(0, 3).map((entry) => ({ place: 3, roadId: entry.id }))
    );
    const four = play(three, { place: 3, roadId: "slag-row" }).career;
    const fourth = play(four, { place: 4, roadId: "ridge-road" });
    const won = play(fourth.career, { place: 1, roadId: "ridge-road" });
    expect([
      roadsFor(recordedRules, three).finaleOpen,
      three.story.finaleUnlocked,
    ]).toStrictEqual([false, false]);
    expect(startRace(recordedRules, three, "ridge-road", 1)).toMatchObject({
      reason: "roadClosed",
      started: false,
    });
    expect([
      roadsFor(recordedRules, four).finaleOpen,
      four.story.finaleUnlocked,
    ]).toStrictEqual([true, true]);
    expect([
      ledgerOf(fourth).ending,
      roadsFor(recordedRules, fourth.career).finaleOpen,
      ledgerOf(won).ending,
      won.career.level,
    ]).toStrictEqual([null, true, "clean-crown", 5]);
    expect(startRace(recordedRules, won.career, "slag-row", 1)).toMatchObject({
      reason: "seasonOver",
      started: false,
    });
  });
});

describe("the story", () => {
  const levelTwo = seasonAt(decent, 1).end;

  it("offers the envelope at level 2, pays $1,500 for taking it, and takes back $2,000 when the player beats Tristan on Breakwater Run", () => {
    const taken = acceptEnvelope(levelTwo);
    const race = enter(taken, "breakwater-run");
    sprint(race, 4, ["tristan-lux"]);
    const behind = settle(race);
    const ahead = play(behind.career, { place: 1, roadId: "breakwater-run" });
    const again = play(ahead.career, { place: 1, roadId: "breakwater-run" });
    expect([
      storyBeat(seasonAt(decent, 1).start).envelopeOpen,
      storyBeat(levelTwo).envelopeOpen,
      taken.cash - levelTwo.cash,
      storyBeat(taken).envelopeOpen,
    ]).toStrictEqual([false, true, 1500, false]);
    expect([
      ledgerOf(behind).envelope,
      ledgerOf(ahead).envelope,
      ledgerOf(ahead).prize,
      ledgerOf(again).envelope,
    ]).toStrictEqual([0, -2000, 2400, 0]);
  });

  it("an envelope that is refused, or left on the board until the Breakwater race, pays nothing and cannot be taken later", () => {
    const refused = refuseEnvelope(levelTwo);
    const left = play(levelTwo, { place: 1, roadId: "breakwater-run" });
    expect([
      acceptEnvelope(refused).cash,
      left.career.story.envelope,
      acceptEnvelope(left.career).cash - left.career.cash,
      ledgerOf(left).envelope,
    ]).toStrictEqual([levelTwo.cash, "refused", 0, 0]);
  });

  it("Dee rides as an ally from level 3 until the player knocks her down twice in one race", () => {
    const levelThree = seasonAt(decent, 3).start;
    const race = enter(levelThree, "slag-row");
    knockDown(race, "dee-santangelo", 2);
    sprint(race, 1);
    const { career } = settle(race);
    expect([
      seasonAt(decent, 2).start.story.deeAlly,
      storyBeat(levelThree).deeAlly,
      career.story.deeAlly,
    ]).toStrictEqual([false, true, false]);
    expect(rivalIn(race.setup, "dee-santangelo")).toMatchObject({
      aggressionBoost: -1,
      grudge: 0,
    });
    expect(
      rivalIn(
        setupFor(recordedRules, career, "slag-row", 3, road),
        "dee-santangelo"
      )
    ).toMatchObject({ aggressionBoost: 0.2, grudge: 0 });
  });

  it("winning the Long Ridge after taking the envelope is the bought crown", () => {
    const beforeFinale = playAll(
      seasonAt(decent, 5).start,
      roadList.slice(0, 4).map((entry) => ({ place: 3, roadId: entry.id }))
    );
    const bought: CareerState = {
      ...beforeFinale,
      story: { ...beforeFinale.story, envelope: "taken" },
    };
    const won = play(bought, { place: 1, roadId: "ridge-road" });
    const second = play(beforeFinale, { place: 2, roadId: "ridge-road" });
    expect([
      ledgerOf(won).ending,
      storyBeat(won.career).endingChapter?.name,
      ledgerOf(second).ending,
    ]).toStrictEqual(["bought-crown", "Bought Crown", "runner-up"]);
  });
});
