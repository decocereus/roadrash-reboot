import { bikes } from "@racer/sim/bikes";
import { bikeAt, rivals, weaponAt } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";
import { pilotInput } from "@racer/sim/pilot";
import { createRace, neutralInput, stepRace } from "@racer/sim/race";
import { MAX_STAMINA } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import {
  TICKS,
  enter,
  flatOut,
  getArrested,
  idle,
  knockDown,
  ledgerOf,
  ride,
  riderOf,
  rivalIn,
  road,
  settle,
  sprint,
  takeWeaponFrom,
} from "./career-fixtures.ts";
import type { Entered } from "./career-fixtures.ts";
import { fieldFor, practiceSetup, roadsFor, setupFor } from "./field.ts";
import { preRaceLine, rivalLines } from "./lines.ts";
import { outcomeOf, recordTick } from "./outcome.ts";
import { quitRace, resumeCareer } from "./settle.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";
import { levels, policeLevels, roadList } from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

const TRUCE_SECONDS = 3;

const photoFinishOver = (race: Entered, rival: RivalId): void => {
  const chaser = riderOf(race, rival);
  const me = riderOf(race, "player");
  const inputs = race.state.riders.map(() => neutralInput);
  inputs[0] = flatOut;
  inputs[race.setup.field.indexOf(rival) + 1] = flatOut;
  me.s = road.length - 60;
  me.x = 1.8;
  me.speed = 40;
  chaser.s = road.length - 72;
  chaser.x = -1.8;
  chaser.speed = 40;
  ride(race, 10, () => inputs);
};

const ATTACK_SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);

const ATTACK_SECONDS = 60;

const attacksOnThePlayer = (
  career: CareerState,
  rival: RivalId,
  roadId: RoadId
): number => {
  let attacks = 0;
  for (const seed of ATTACK_SEEDS) {
    const setup = setupFor(career, roadId, seed, road);
    const state = createRace(setup);
    const index = setup.field.indexOf(rival) + 1;
    const inputs = state.riders.map(() => ({ ...neutralInput }));
    const input = inputs[index];
    const [me] = state.riders;
    const them = state.riders[index];
    if (!(input && me && them)) {
      throw new Error(`${rival} is not in the race with seed ${seed}.`);
    }
    for (const other of setup.field) {
      const rider = state.riders[setup.field.indexOf(other) + 1];
      if (rider) {
        rider.s = 400;
      }
    }
    for (
      let tick = 0;
      tick < (TRUCE_SECONDS + ATTACK_SECONDS) * TICKS;
      tick += 1
    ) {
      me.s = 50;
      me.x = 0.3;
      me.speed = 30;
      me.stamina = MAX_STAMINA;
      them.s = 50;
      them.x = 1.8;
      them.speed = 30;
      pilotInput(state, road, index, input);
      stepRace(state, road, inputs);
      attacks += state.events.filter(
        (event) => event.kind === "attack" && event.rider === index
      ).length;
    }
  }
  return attacks;
};

const atLevel = (level: Level): CareerState => ({
  ...newCareer(1),
  level,
});

const junoAggression = (roadId: RoadId): number | undefined => {
  const seed =
    Array.from({ length: 40 }, (_, index) => index + 1).find((candidate) =>
      fieldFor(roadId, 5, candidate).includes("juno-kade")
    ) ?? 0;
  const setup = setupFor(atLevel(5), roadId, seed, road);
  return setup.rivals[setup.field.indexOf("juno-kade")]?.aggression;
};

describe("the field", () => {
  it("always has fourteen different rivals with the road's home riders among them", () => {
    const problems: string[] = [];
    for (const level of levels) {
      for (const entry of roadList) {
        for (let seed = 1; seed <= 40; seed += 1) {
          const field = fieldFor(entry.id, level, seed);
          const home = roadsFor(atLevel(level)).roads.find(
            (status) => status.road.id === entry.id
          )?.home;
          if (
            new Set(field).size !== 14 ||
            !home ||
            home.length < 3 ||
            !home.every((rival) => field.includes(rival))
          ) {
            problems.push(`${entry.id} level ${level} seed ${seed}`);
          }
        }
      }
    }
    expect(problems).toStrictEqual([]);
  });

  it("never draws Juno at level 1, where Ruth Ann stands in on Ridge Road, and always draws her on Ridge Road from level 2", () => {
    const seeds = Array.from({ length: 60 }, (_, seed) => seed + 1);
    const levelOne = roadList.flatMap((entry) =>
      seeds.flatMap((seed) => fieldFor(entry.id, 1, seed))
    );
    const ridge = (level: Level) =>
      seeds.map((seed) => fieldFor("ridge-road", level, seed));
    expect(levelOne).not.toContain("juno-kade");
    expect(
      ridge(1).every(
        (field) =>
          field.includes("ruth-ann-bixby") && field.includes("coach-dale-hutto")
      )
    ).toBeTruthy();
    expect(
      ([2, 5] as const).map((level) =>
        ridge(level).every((field) => field.includes("juno-kade"))
      )
    ).toStrictEqual([true, true]);
  });

  it("draws a different mix from a different seed and the same mix from the same seed", () => {
    const fields = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        [...fieldFor("slag-row", 2, seed)].toSorted().join(",")
      )
    );
    expect(fields.size).toBeGreaterThan(5);
    expect(fieldFor("slag-row", 2, 9)).toStrictEqual(
      fieldFor("slag-row", 2, 9)
    );
  });

  it("puts every rival on their bike and weapon for the level, the level's police on the road, and the player last on the grid", () => {
    const setup = setupFor(atLevel(4), "hollow-pine-road", 3, road);
    const state = createRace(setup);
    const [player, ...others] = state.riders;
    expect(
      setup.rivals.map((rival) => [rival.name, rival.bike.id, rival.weapon])
    ).toStrictEqual(
      setup.field.map((rival) => [
        rivals[rival].name,
        bikeAt(rivals[rival], 4),
        weaponAt(rivals[rival], 4),
      ])
    );
    expect(setup.police).toMatchObject({
      beat: 1500,
      count: 4,
      fine: 2200,
      officer: { name: "Deputy Wendell Haverty" },
      sightRange: 50,
      topSpeed: 64,
    });
    expect(
      others.filter((rider) => rider.profile.role === "police")
    ).toHaveLength(policeLevels[4].count);
    expect(
      others
        .filter((rider) => rider.profile.role === "racer")
        .every((rider) => rider.s > (player?.s ?? 0))
    ).toBeTruthy();
    expect(player?.bike).toBe(bikes["halden-wren-400"]);
  });

  it("a quick race puts the player on the picked bike at the picked level, empty-handed, against a fresh field with no grudges", () => {
    const setup = practiceSetup(
      {
        bikeId: "ostra-sesta-600",
        level: 4,
        roadId: "hollow-pine-road",
        seed: 3,
      },
      road
    );
    const [player] = createRace(setup).riders;
    expect(player?.bike).toBe(bikes["ostra-sesta-600"]);
    expect(player?.weapon).toBe("none");
    expect([setup.level, setup.raceId, setup.police.count]).toStrictEqual([
      4,
      1,
      policeLevels[4].count,
    ]);
    expect(setup.field).toStrictEqual(fieldFor("hollow-pine-road", 4, 3));
    expect(
      setup.rivals.map((rival) => [rival.aggressionBoost, rival.grudge])
    ).toStrictEqual(setup.rivals.map(() => [0, undefined]));
  });

  it("Juno rides the Long Ridge at an aggression of 0.9 and anywhere else at her own", () => {
    expect([
      junoAggression("ridge-road"),
      junoAggression("cinder-wash"),
    ]).toStrictEqual([0.9, 0.25]);
  });
});

const afterMooseIsBusted = (playerAhead: number) => {
  const race = enter(newCareer(2), "slag-row");
  riderOf(race, "player").s = 200 + playerAhead;
  getArrested(race, "moose-kowalczyk");
  sprint(race, 1);
  const { career } = settle(race);
  return {
    blamed: career.memory["moose-kowalczyk"].bustedNearPlayer,
    line: preRaceLine(career, setupFor(career, "slag-row", 8, road)),
    note: career.board.find((note) => note.kind === "busted"),
    unblamed: career.memory["moose-kowalczyk"].busted,
  };
};

describe("memory", () => {
  it("a rival the player knocked down twice holds a grudge next race and opens with the grudge taunt", () => {
    const race = enter(newCareer(2), "slag-row");
    knockDown(race, "dee-santangelo", 2);
    sprint(race, 1);
    const settled = settle(race);
    const next = setupFor(settled.career, "slag-row", 8, road);
    expect(settled.career.memory["dee-santangelo"]).toMatchObject({
      aggressionBonus: 0.2,
      grudge: true,
      knockedDownByPlayer: 1,
      sharedRace: 1,
    });
    expect(rivalIn(next, "dee-santangelo")).toMatchObject({
      aggressionBoost: 0.2,
      grudge: 0,
    });
    expect(preRaceLine(settled.career, next)).toStrictEqual({
      rival: "dee-santangelo",
      text: rivalLines["dee-santangelo"].grudgeTaunt,
    });
    expect([
      settled.career.record.knockdowns,
      settled.career.board[0],
    ]).toMatchObject([
      2,
      { kind: "wentDown", rival: "dee-santangelo", roadId: "slag-row" },
    ]);
  });

  it(
    "a rival knocked down once attacks the player more often next race, and one beaten cleanly attacks less often",
    { timeout: 30_000 },
    () => {
      const fresh = newCareer(2);
      const fought = enter(fresh, "breakwater-run");
      knockDown(fought, "tristan-lux", 1);
      sprint(fought, 1);
      const sore = settle(fought).career;
      const clean = enter(fresh, "breakwater-run");
      sprint(clean, 1);
      const respectful = settle(clean).career;
      const usual = attacksOnThePlayer(fresh, "tristan-lux", "breakwater-run");
      expect(usual).toBeGreaterThan(500);
      expect(
        attacksOnThePlayer(sore, "tristan-lux", "breakwater-run")
      ).toBeGreaterThan(usual);
      expect(
        attacksOnThePlayer(respectful, "tristan-lux", "breakwater-run")
      ).toBeLessThan(usual);
      expect([
        rivalIn(setupFor(sore, "breakwater-run", 8, road), "tristan-lux")
          ?.grudge,
        preRaceLine(sore, setupFor(sore, "breakwater-run", 8, road))?.text,
      ]).toStrictEqual([undefined, rivalLines["tristan-lux"].grudgeTaunt]);
    }
  );

  it("a rival the player beat cleanly cools off, however often, and one with no memory opens with the default taunt", () => {
    const fresh = newCareer(2);
    const first = setupFor(fresh, "slag-row", 7, road);
    const race = enter(fresh, "slag-row");
    sprint(race, 1);
    const { career } = settle(race);
    const again = enter(career, "slag-row");
    sprint(again, 1);
    const twice = settle(again).career;
    const speaker = preRaceLine(fresh, first);
    expect(speaker?.text).toBe(
      speaker ? rivalLines[speaker.rival].taunt : undefined
    );
    expect(
      race.setup.field.map((rival) => career.memory[rival].aggressionBonus)
    ).toStrictEqual(Array.from({ length: 14 }, () => -0.05));
    expect(
      again.setup.field.map((rival) => twice.memory[rival].aggressionBonus)
    ).toStrictEqual(Array.from({ length: 14 }, () => -0.05));
  });

  it("a win by a wheel is remembered and pinned to the board", () => {
    const race = enter(newCareer(2), "slag-row");
    photoFinishOver(race, "dee-santangelo");
    const settled = settle(race);
    expect(settled.career.memory["dee-santangelo"]).toMatchObject({
      aggressionBonus: 0.05,
      lostToPlayerByAWheel: 1,
    });
    expect(settled.career.board).toContainEqual({
      kind: "photoFinish",
      loser: "dee-santangelo",
      winner: "player",
    });
    expect(ledgerOf(settled).line).toStrictEqual({
      rival: "dee-santangelo",
      text: rivalLines["dee-santangelo"].youBeatThem,
    });
  });

  it("a stolen weapon is carried into the next race and its owner wants it back", () => {
    const race = enter(newCareer(2), "slag-row");
    takeWeaponFrom(race, "moose-kowalczyk");
    sprint(race, 1);
    const { career } = settle(race);
    const next = setupFor(career, "cinder-wash", 4, road);
    expect([career.weapon, career.weaponHits]).toStrictEqual(["club", 6]);
    expect([next.player.weapon, next.player.weaponHits]).toStrictEqual([
      "club",
      6,
    ]);
    expect(career.memory["moose-kowalczyk"]).toMatchObject({
      aggressionBonus: 0.15,
      grudge: true,
      weaponTakenByPlayer: 1,
    });
    expect(career.board[0]).toStrictEqual({
      kind: "weaponWanted",
      rival: "moose-kowalczyk",
      weapon: "club",
    });
  });

  it("a rival who punches the player into a car is put down for the knockdown, with the kilometre it happened at", () => {
    const race = enter(newCareer(2), "slag-row");
    const me = riderOf(race, "player");
    const dee = riderOf(race, "dee-santangelo");
    const deeIndex = race.setup.field.indexOf("dee-santangelo") + 1;
    const inputs = race.state.riders.map(() => neutralInput);
    inputs[0] = idle;
    let struck = false;
    for (let tick = 0; tick < TICKS && !struck; tick += 1) {
      me.s = 2000;
      me.x = 0.3;
      me.speed = 30;
      dee.s = 2000;
      dee.x = 1.8;
      dee.speed = 30;
      inputs[deeIndex] = { ...idle, punch: tick === 0 };
      stepRace(race.state, road, inputs);
      recordTick(race.log, race.state, race.setup);
      struck = race.state.events.some(
        (event) => event.kind === "hit" && event.target === 0
      );
    }
    race.state.cars.push({
      cruiseSpeed: 0,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 0,
      s: me.s + 6,
      speed: 0,
      x: me.x,
    });
    const crashes: string[] = [];
    for (let tick = 0; tick < TICKS; tick += 1) {
      stepRace(race.state, road, inputs);
      recordTick(race.log, race.state, race.setup);
      crashes.push(
        ...race.state.events.flatMap((event) =>
          event.kind === "crash" && event.rider === 0 ? [event.cause] : []
        )
      );
    }
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const { career } = quitRace(race.career, outcome);
    const incidents = outcome.incidents.find(
      (incident) => incident.rival === "dee-santangelo"
    );
    expect(crashes).toStrictEqual(["traffic"]);
    expect(incidents?.knockedPlayerDown).toBe(1);
    expect(incidents?.knockedPlayerDownKm).toBeCloseTo(2, 1);
    expect(career.memory["dee-santangelo"]).toMatchObject({
      aggressionBonus: -0.05,
      knockedPlayerDown: 1,
    });
    expect(career.board[0]).toStrictEqual({
      kind: "knockedPlayerDown",
      km: incidents?.knockedPlayerDownKm,
      rival: "dee-santangelo",
      roadId: "slag-row",
    });
  });

  it("a rival who crosses the line within half a second ahead won by a wheel, and one further ahead did not", () => {
    const race = enter(newCareer(2), "slag-row");
    const [clear, close] = race.setup.field;
    if (!(clear && close)) {
      throw new Error("The field is short.");
    }
    const inputs = race.state.riders.map(() => neutralInput);
    inputs[0] = flatOut;
    inputs[1] = flatOut;
    inputs[2] = flatOut;
    const placed = [
      [riderOf(race, clear), 10],
      [riderOf(race, close), 70],
      [riderOf(race, "player"), 82],
    ] as const;
    for (const [rider, short] of placed) {
      rider.s = road.length - short;
      rider.speed = 40;
    }
    ride(race, 10, () => inputs);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const { career } = settle(race);
    const finishOf = (racer: RivalId | "player") =>
      outcome.placings.find((placing) => placing.racer === racer)?.finishTick ??
      0;
    expect(outcome.place).toBe(3);
    expect(finishOf("player") - finishOf(close)).toBeLessThanOrEqual(30);
    expect(finishOf("player") - finishOf(clear)).toBeGreaterThan(30);
    expect([
      career.memory[close].beatPlayerByAWheel,
      career.memory[clear].beatPlayerByAWheel,
    ]).toStrictEqual([1, 0]);
    expect(career.board).toStrictEqual([
      { kind: "photoFinish", loser: "player", winner: close },
    ]);
  });

  it("a rival busted within 100 m of the player blames them, and one busted further off does not", () => {
    const note = {
      fine: 400,
      kind: "busted",
      rival: "moose-kowalczyk",
      roadId: "slag-row",
    };
    expect(afterMooseIsBusted(90)).toStrictEqual({
      blamed: 1,
      line: {
        rival: "moose-kowalczyk",
        text: rivalLines["moose-kowalczyk"].grudgeTaunt,
      },
      note,
      unblamed: 0,
    });
    expect(afterMooseIsBusted(135)).toStrictEqual({
      blamed: 0,
      line: {
        rival: "moose-kowalczyk",
        text: rivalLines["moose-kowalczyk"].taunt,
      },
      note,
      unblamed: 1,
    });
  });

  it("the board keeps the three newest notes with the newest first", () => {
    const left = resumeCareer(enter(newCareer(2), "slag-row").career).career;
    const race = enter(left, "slag-row");
    const third = race.setup.field.find(
      (rival) => rival !== "moose-kowalczyk" && rival !== "dee-santangelo"
    );
    if (!third) {
      throw new Error("The field is short.");
    }
    takeWeaponFrom(race, "moose-kowalczyk");
    knockDown(race, "dee-santangelo", 1);
    photoFinishOver(race, third);
    const { career } = settle(race);
    expect(left.board).toStrictEqual([{ kind: "leftRace" }]);
    expect(career.board).toMatchObject([
      { kind: "photoFinish", loser: third, winner: "player" },
      { kind: "wentDown", rival: "dee-santangelo" },
      { kind: "weaponWanted", rival: "moose-kowalczyk" },
    ]);
    expect(career.board).toHaveLength(3);
  });
});
