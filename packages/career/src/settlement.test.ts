import { createRace, stepRace } from "@racer/sim/race";
import { frameOf } from "@racer/sim/race-fixtures";
import type { InputFrame } from "@racer/sim/state";
import { arm } from "@racer/sim/weapons";
import { roadAtLevel } from "@racer/track/road";
import { regionOf, roads as roadPlans, trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
import {
  TICKS,
  enter,
  everyRider,
  flatOut,
  getArrested,
  knockDown,
  ledgerOf,
  ride,
  racerIn,
  road,
  settle,
  sprint,
} from "./career-fixtures.ts";
import { setupFor } from "./field.ts";
import { bustedLine, officerLines, preRaceLine, rivalLines } from "./lines.ts";
import { createRaceLog, outcomeOf, recordTick } from "./outcome.ts";
import { parseCareer, serialiseCareer } from "./save.ts";
import { seasonBoard } from "./season.ts";
import { quitRace, resumeCareer, settleRace, startRace } from "./settle.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";
import { LEFT_RACE_NOTE, storyBeat } from "./story.ts";
import { levels, roadList } from "./tables.ts";

const topPoints = (career: CareerState): number[] =>
  seasonBoard(career)
    .map((row) => row.points)
    .slice(0, 8);

describe("leaving a race", () => {
  it("a reload in the middle of a race settles it as a wreck once and only once", () => {
    const racing = enter(newCareer(3), "ridge-road").career;
    const saved = parseCareer(recordedRules, serialiseCareer(racing));
    if (!saved.ok) {
      throw new Error(`The save did not load: ${saved.error.field}.`);
    }
    const first = resumeCareer(recordedRules, saved.career);
    const reloaded = parseCareer(recordedRules, serialiseCareer(first.career));
    if (!reloaded.ok) {
      throw new Error(`The save did not load: ${reloaded.error.field}.`);
    }
    const second = resumeCareer(recordedRules, reloaded.career);
    expect(ledgerOf(first)).toMatchObject({
      cashAfter: 1100,
      prize: 0,
      repair: 400,
      result: "quit",
    });
    expect([
      first.career.activeRace,
      storyBeat(first.career).leftRaceNote,
      second.ledger,
      second.career.cash,
      second.career.record.wrecks,
    ]).toStrictEqual([null, LEFT_RACE_NOTE, null, 1100, 1]);
    expect(second.career.board).toStrictEqual([{ kind: "leftRace" }]);
  });

  it("a race that has settled cannot be settled again with the same result", () => {
    const race = enter(newCareer(3), "slag-row");
    sprint(race, 1);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const once = settleRace(recordedRules, race.career, outcome);
    const twice = settleRace(recordedRules, once.career, outcome);
    expect([once.career.cash, once.settled]).toStrictEqual([3000, true]);
    expect(twice).toStrictEqual({
      career: once.career,
      ledger: null,
      reason: "noActiveRace",
      settled: false,
    });
  });

  it("a result from an earlier race cannot settle a later one on the same road with the same seed", () => {
    const first = enter(newCareer(3), "slag-row", 7);
    sprint(first, 1);
    const won = outcomeOf(first.state, first.setup, first.log);
    const paid = settleRace(recordedRules, first.career, won);
    const second = enter(paid.career, "slag-row", 7);
    const replayed = settleRace(recordedRules, second.career, won);
    sprint(second, 1);
    const repeat = settle(second);
    expect([first.setup.seed, won.raceId]).toStrictEqual([
      second.setup.seed,
      1,
    ]);
    expect(replayed).toStrictEqual({
      career: second.career,
      ledger: null,
      reason: "wrongRace",
      settled: false,
    });
    expect([
      paid.career.cash,
      replayed.career.cash,
      replayed.career.activeRace?.raceId,
      repeat.career.cash,
    ]).toStrictEqual([3000, 3000, 2, 3750]);
  });

  it("quitting from the pause menu costs the repair bill and still scores the riders left racing", () => {
    const race = enter(newCareer(3), "slag-row");
    const frame = everyRider(race, flatOut);
    ride(race, 5, () => frame);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const settled = quitRace(recordedRules, race.career, outcome);
    const board = seasonBoard(settled.career);
    expect([
      outcome.result,
      outcome.place,
      outcome.placings.length,
    ]).toStrictEqual(["quit", 15, 15]);
    expect(ledgerOf(settled)).toMatchObject({ cashAfter: 1100, repair: 400 });
    expect(board.map((row) => row.points).slice(0, 8)).toStrictEqual([
      15, 14, 13, 12, 11, 10, 9, 8,
    ]);
    expect(settled.career.season.player.points).toBe(0);
  });

  it("quitting after a fight still scores the season and the rival remembers the fight, and a reload remembers nothing", () => {
    const race = enter(newCareer(3), "slag-row");
    knockDown(race, "dee-santangelo", 1);
    const frame = everyRider(race, flatOut);
    ride(race, 2, () => frame);
    const quit = quitRace(
      recordedRules,
      race.career,
      outcomeOf(race.state, race.setup, race.log)
    );
    const reloaded = resumeCareer(recordedRules, race.career);
    expect([ledgerOf(quit), ledgerOf(reloaded)]).toMatchObject([
      { cashAfter: 1100, prize: 0, repair: 400, result: "quit" },
      { cashAfter: 1100, prize: 0, repair: 400, result: "quit" },
    ]);
    expect([topPoints(quit.career), topPoints(reloaded.career)]).toStrictEqual([
      [15, 14, 13, 12, 11, 10, 9, 8],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    expect([
      quit.career.memory["dee-santangelo"].knockedDownByPlayer,
      quit.career.record.knockdowns,
      quit.career.board[0]?.kind,
      reloaded.career.memory["dee-santangelo"].knockedDownByPlayer,
      reloaded.career.record.knockdowns,
      reloaded.career.board[0]?.kind,
    ]).toStrictEqual([1, 1, "wentDown", 0, 0, "leftRace"]);
    expect(
      preRaceLine(
        quit.career,
        setupFor(recordedRules, quit.career, "slag-row", 8, road)
      )
    ).toStrictEqual({
      rival: "dee-santangelo",
      text: rivalLines["dee-santangelo"].grudgeTaunt,
    });
  });

  it("nothing that happens after the player finishes changes the result", () => {
    const race = enter(newCareer(3), "slag-row");
    sprint(race, 2);
    const settledAt = outcomeOf(race.state, race.setup, race.log);
    const frame = everyRider(race, flatOut);
    for (let tick = 0; tick < 20 * TICKS; tick += 1) {
      stepRace(race.state, road, frame);
      recordTick(race.log, race.state, race.setup);
    }
    expect(outcomeOf(race.state, race.setup, race.log)).toBe(settledAt);
    expect(settledAt.placings.map((placing) => placing.fate)).toStrictEqual([
      "finished",
      "finished",
      ...Array.from({ length: 13 }, () => "racing"),
    ]);
  });
});

describe("the roads", () => {
  it("the career's road table agrees with the track package on every length, region, and name", () => {
    const career = roadList.flatMap((entry) =>
      levels.map((level) => [
        entry.id,
        entry.name,
        entry.region,
        entry.lengths[level],
      ])
    );
    const track = roadList.flatMap((entry) =>
      levels.map((level) => [
        entry.id,
        roadPlans[entry.id].plan.name,
        regionOf(entry.id),
        roadAtLevel(roadPlans[entry.id], level).pieces.reduce(
          (total, piece) => total + piece.length,
          0
        ),
      ])
    );
    expect(career).toStrictEqual(track);
  });

  it(
    "a whole pilot-ridden race on Slag Row settles into fifteen places and a ledger that adds up",
    { timeout: 30_000 },
    () => {
      const course = trackFor("slag-row", 1);
      const start = startRace(recordedRules, newCareer(21), "slag-row", 21);
      const setup = setupFor(
        recordedRules,
        start.career,
        "slag-row",
        21,
        course
      );
      const state = createRace({
        ...setup,
        player: { ...setup.player, controller: "pilot" },
      });
      const log = createRaceLog(setup);
      const frame: InputFrame = new Map();
      for (let tick = 0; tick < 400 * TICKS && !log.outcome; tick += 1) {
        stepRace(state, course, frame);
        recordTick(log, state, setup);
      }
      const outcome = outcomeOf(state, setup, log);
      const ledger = ledgerOf(settleRace(recordedRules, start.career, outcome));
      expect(log.outcome).toBe(outcome);
      expect(outcome.placings.map((placing) => placing.place)).toStrictEqual(
        Array.from({ length: 15 }, (_, index) => index + 1)
      );
      expect(
        new Set(outcome.placings.map((placing) => placing.racer))
      ).toStrictEqual(new Set(["player", ...setup.field]));
      expect(outcome.placings[outcome.place - 1]?.racer).toBe("player");
      expect(ledger.cashAfter).toBe(
        1500 + ledger.prize - ledger.repair - ledger.fine
      );
    }
  );
});

describe("a bust", () => {
  it("records the fine, the officer, where it happened, and the weapon held when the rider was thrown", () => {
    const race = enter(newCareer(2), "hollow-pine-road");
    arm(racerIn(race, "player"), "chain");
    getArrested(race);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const settled = settleRace(recordedRules, race.career, outcome);
    expect(outcome).toMatchObject({
      arrest: {
        fine: 400,
        officer: "wendell-haverty",
        weapon: "chain",
      },
      place: 15,
      result: "busted",
    });
    expect(outcome.arrest?.km).toBeCloseTo(0.2, 1);
    expect({
      bust: settled.career.lastResult?.summary.bust,
      busts: settled.career.record.busts,
      weapon: settled.career.weapon,
    }).toStrictEqual({
      bust: {
        fine: 400,
        km: outcome.arrest?.km,
        line: bustedLine("wendell-haverty", race.setup.seed),
        officer: "wendell-haverty",
        officerName: "Deputy Wendell Haverty",
        weapon: "chain",
      },
      busts: 1,
      weapon: "none",
    });
    expect(ledgerOf(settled)).toMatchObject({
      cashAfter: 1100,
      fine: 400,
      prize: 0,
      qualified: false,
    });
    expect(officerLines["wendell-haverty"]).toContain(
      bustedLine("wendell-haverty", race.setup.seed)
    );
  });

  it("the ticket names the spot on the road where the rider lay, not the verge they were moved to", () => {
    const race = enter(newCareer(2), "hollow-pine-road");
    const player = racerIn(race, "player");
    let lay = { s: player.bodyS, x: player.bodyX };
    const cop = race.state.riders.find(
      (rider) => rider.profile.role === "police"
    );
    if (!cop) {
      throw new Error("The race has no cop.");
    }
    cop.controller = "pilot";
    const frame = frameOf(race.state);
    cop.parked = false;
    cop.s = 150;
    cop.x = road.plan.laneWidth / 2;
    cop.speed = 22;
    player.s = 200;
    player.speed = 15;
    player.stamina = 0;
    for (let tick = 0; tick < 30 * TICKS && !race.log.outcome; tick += 1) {
      lay = { s: player.bodyS, x: player.bodyX };
      stepRace(race.state, road, frame);
      recordTick(race.log, race.state, race.setup);
    }
    const { arrest, km } = outcomeOf(race.state, race.setup, race.log);
    expect(Math.abs((arrest?.km ?? 0) * 1000 - lay.s)).toBeLessThan(0.2);
    expect(Math.abs((arrest?.x ?? 9) - lay.x)).toBeLessThan(0.2);
    expect(km).toBe(arrest?.km);
    expect([
      Math.abs(arrest?.x ?? 9) < road.roadHalfWidth,
      Math.abs(player.bodyX) > road.roadHalfWidth,
    ]).toStrictEqual([true, true]);
  });
});
