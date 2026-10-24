import { bikeAt, rivals } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";
import { describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
import {
  crashOut,
  enter,
  knockDown,
  lastOf,
  ledgerOf,
  play,
  playAll,
  settle,
  sprint,
  takeWeaponFrom,
  wreckTimes,
} from "./career-fixtures.ts";
import { rivalLines } from "./lines.ts";
import { outcomeOf } from "./outcome.ts";
import { parseCareer, serialiseCareer } from "./save.ts";
import { startRace } from "./settle.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";
import { roadList } from "./tables.ts";

const loaded = (career: CareerState): CareerState => {
  const save = parseCareer(recordedRules, serialiseCareer(career));
  if (!save.ok) {
    throw new Error(`The save did not load: ${save.error.field}.`);
  }
  return save.career;
};

describe("the last result", () => {
  it("a refresh during the finish animation still has every number Results shows", () => {
    const race = enter(newCareer(3), "slag-row");
    sprint(race, 2);
    const settled = settle(race);
    const stored = loaded(settled.career).lastResult;
    const [winner, ...others] = race.setup.field;
    if (!(stored && winner)) {
      throw new Error("The save holds no result.");
    }
    const [first, second, third] = stored.summary.rows;
    expect(stored.ledger).toStrictEqual(ledgerOf(settled));
    expect(stored.ledger).toMatchObject({
      cashAfter: 2500,
      cashBefore: 1500,
      fine: 0,
      gameOver: false,
      levelUp: null,
      line: { rival: winner, text: rivalLines[winner].beatYou },
      place: 2,
      prize: 1000,
      qualified: true,
      repair: 0,
      repeat: false,
      repossessed: null,
    });
    expect(stored.summary).toMatchObject({
      bust: null,
      rows: [
        {
          bikeId: bikeAt(rivals[winner], 1),
          fate: "finished",
          name: rivals[winner].name,
          place: 1,
          prize: 1500,
          racer: winner,
        },
        {
          bikeId: "halden-wren-400",
          fate: "finished",
          name: "You",
          place: 2,
          prize: 1000,
          racer: "player",
        },
        ...others.toReversed().map((rival, index) => ({
          fate: "racing",
          finishTick: -1,
          name: rivals[rival].name,
          place: index + 3,
          prize: [700, 400, 250, 150, 100, 50, 40, 30, 25, 20, 15, 10, 10][
            index
          ],
          racer: rival,
        })),
      ],
      wreck: null,
    });
    expect([
      (first?.finishTick ?? 0) > 0,
      (second?.finishTick ?? 0) > (first?.finishTick ?? 0),
      (third?.metresLeft ?? 0) > 8000,
    ]).toStrictEqual([true, true, true]);
  });

  it("holds the wreck, the level-up, and the repossession, and is cleared when the next race starts", () => {
    const race = enter(newCareer(2), "slag-row");
    crashOut(race);
    const { km } = outcomeOf(race.state, race.setup, race.log);
    const wrecked = settle(race);
    const four = playAll(
      newCareer(5),
      roadList.slice(0, 4).map((entry) => ({ place: 3, roadId: entry.id }))
    );
    const promoted = play(four, { place: 1, roadId: "ridge-road" });
    const broke = lastOf(
      wreckTimes(lastOf(wreckTimes(newCareer(1), 4)).career, 3)
    );
    const next = startRace(recordedRules, promoted.career, "slag-row", 3);
    expect(km).toBeGreaterThan(0.3);
    expect(loaded(wrecked.career).lastResult).toMatchObject({
      ledger: { repair: 400, result: "wrecked" },
      summary: { wreck: { bikeId: "halden-wren-400", km } },
    });
    expect(loaded(promoted.career).lastResult?.ledger.levelUp).toStrictEqual({
      bikes: ["ostra-sette-750", "brack-stoker-800"],
      level: 2,
    });
    expect(loaded(broke.career).lastResult?.ledger).toMatchObject({
      cashAfter: 500,
      repossessed: { bikeId: "halden-wren-400", tradeIn: 1800 },
    });
    expect([
      promoted.career.lastResult?.summary.raceId,
      next.career.lastResult,
      next.career.activeRace?.raceId,
    ]).toStrictEqual([5, null, 6]);
  });

  it("carries the incidents Results prints under a rival's row", () => {
    const race = enter(newCareer(2), "slag-row");
    takeWeaponFrom(race, "moose-kowalczyk");
    knockDown(race, "dee-santangelo", 1);
    sprint(race, 1);
    const incidents = loaded(settle(race).career).lastResult?.summary.incidents;
    const about = (rival: RivalId) =>
      incidents?.find((incident) => incident.rival === rival);
    expect(about("moose-kowalczyk")).toMatchObject({
      knockedDownByPlayer: 0,
      weaponTakenByPlayer: "club",
    });
    expect(about("dee-santangelo")).toMatchObject({
      knockedDownByPlayer: 1,
      weaponTakenByPlayer: "none",
    });
    expect(about("dee-santangelo")?.knockdownTick).toBeGreaterThan(
      about("moose-kowalczyk")?.weaponTakenTick ?? 0
    );
    expect(about("dee-santangelo")?.knockdownKm).toBeGreaterThan(0.05);
  });
});
