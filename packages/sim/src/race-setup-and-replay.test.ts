import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { cast, rivalAt, rivals } from "./cast.ts";
import { pilotInput } from "./pilot.ts";
import {
  brawl,
  cruising,
  field,
  pilotAll,
  player,
  pressing,
  quietTrack,
  rivalIn,
  straight,
  track,
} from "./race-fixtures.ts";
import {
  createRace,
  defaultSetup,
  neutralInput,
  stepRace,
  validateSetup,
} from "./race.ts";
import {
  MAX_STAMINA,
  PLAYER_RIDER,
  riderOf,
  rosterOf,
  TICK_RATE,
} from "./state.ts";
import type {
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderId,
  RiderInput,
  RivalSetup,
} from "./state.ts";
import { disarm } from "./weapons.ts";

const wideTrack = compileTrack({ ...ridgeRoad, lanesEachWay: 2 });

const pilotUntilFinish = (
  state: RaceState,
  course: Track,
  limitSeconds: number
) => {
  const input: RiderInput = {
    brake: 0,
    kick: false,
    punch: false,
    steer: 0,
    throttle: 0,
  };
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < limitSeconds * TICK_RATE; tick += 1) {
    pilotInput(state, course, player(state), input);
    stepRace(state, course, [input]);
    events.push(...state.events);
    if (player(state).finishTick >= 0) {
      break;
    }
  }
  return events;
};

describe("a full race", () => {
  it("the pilot finishes an empty Ridge Road cleanly in a sensible time", () => {
    const state = field(quietTrack, 1, 0, 0);
    const events = pilotUntilFinish(state, quietTrack, 240);
    const rider = player(state);
    expect(rider.finishTick).toBeGreaterThan(0);
    expect(rider.crashes).toBe(0);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    const seconds = rider.finishTick / TICK_RATE;
    expect(seconds).toBeGreaterThan(160);
    expect(seconds).toBeLessThan(195);
  });

  it("the pilot gets through traffic and still finishes", () => {
    const state = field(track, 11, 0, 0);
    pilotUntilFinish(state, track, 400);
    expect(player(state).finishTick).toBeGreaterThan(0);
  });

  it("replays identically from the same seed and inputs", () => {
    const first = field(track, 3, 0, 0);
    const second = field(track, 3, 0, 0);
    pilotUntilFinish(first, track, 60);
    pilotUntilFinish(second, track, 60);
    expect(second).toStrictEqual(first);
  });
});

const pilotPack = (states: readonly RaceState[], seconds: number) => {
  const inputs = states.map((state) =>
    state.riders.map(() => ({ ...cruising }))
  );
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    for (const [raceIndex, state] of states.entries()) {
      const each = inputs[raceIndex] ?? [];
      pilotAll(state, track, each);
      stepRace(state, track, each);
    }
  }
};

describe("replays", () => {
  it("a six-rider pack replays the same from the same seed, alone or beside another race", () => {
    const solo = createRace(defaultSetup(track, 5));
    pilotPack([solo], 40);
    const again = createRace(defaultSetup(track, 5));
    pilotPack([again], 40);
    const beside = createRace(defaultSetup(track, 5));
    const other = createRace(defaultSetup(track, 9));
    pilotPack([beside, other], 40);
    expect(JSON.stringify(again)).toBe(JSON.stringify(solo));
    expect(JSON.stringify(beside)).toBe(JSON.stringify(solo));
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(solo));
  });
});

const rivalsOf = (state: RaceState): number[] =>
  state.riders
    .filter(
      (rider) => rider.id !== PLAYER_RIDER && rider.profile.role === "racer"
    )
    .map((rider) => rider.s);

const everyRival = Object.values(rivals).map((rival) => rivalAt(rival, 3));

const setupWith = (entrants: readonly RivalSetup[]): RaceSetup => ({
  ...defaultSetup(straight, 1),
  rivals: entrants,
});

describe("race setups", () => {
  it("a setup that lists a rival twice is rejected", () => {
    const [dee, moose] = everyRival;
    if (!(dee && moose)) {
      throw new Error("The cast has fewer than two rivals.");
    }
    const setup = setupWith([dee, moose, dee]);
    expect(validateSetup(setup)).toStrictEqual([
      { kind: "duplicateRival", name: dee.name },
    ]);
    expect(() => createRace(setup)).toThrow(
      `${dee.name} is on the grid more than once.`
    );
  });

  it("a setup with fifteen rivals is rejected and fourteen fill the grid", () => {
    const fifteen = setupWith(everyRival.slice(0, 15));
    const fourteen = setupWith(everyRival.slice(0, 14));
    expect(validateSetup(fifteen)).toStrictEqual([
      { count: 15, kind: "tooManyRivals" },
    ]);
    expect(() => createRace(fifteen)).toThrow("at most 14 rivals");
    expect(validateSetup(fourteen)).toStrictEqual([]);
    expect(
      createRace(fourteen).riders.filter(
        (rider) => rider.profile.role === "racer"
      )
    ).toHaveLength(15);
  });

  it("every problem with a setup is reported at once", () => {
    const [dee] = everyRival;
    if (!dee) {
      throw new Error("The cast has no rivals.");
    }
    const setup = setupWith([...everyRival.slice(0, 15), dee]);
    expect(validateSetup(setup).map((problem) => problem.kind)).toStrictEqual([
      "tooManyRivals",
      "duplicateRival",
    ]);
    expect(() => createRace(setup)).toThrow(
      `A race takes at most 14 rivals, and this one has 16. ${dee.name} is on the grid more than once.`
    );
  });

  it("a grudge against the rival itself or against a cop is rejected, and one against another racer is not", () => {
    const [dee, moose] = everyRival;
    if (!(dee && moose)) {
      throw new Error("The cast has fewer than two rivals.");
    }
    const base = setupWith([dee, moose]);
    const {
      police: [cop],
      rivals: [deeId, mooseId],
    } = rosterOf(base);
    if (!(cop !== undefined && deeId !== undefined && mooseId !== undefined)) {
      throw new Error("The roster has no cop or fewer than two rivals.");
    }
    const grudging = (deeGrudge: RiderId, mooseGrudge: RiderId) =>
      setupWith([
        { ...dee, grudge: deeGrudge },
        { ...moose, grudge: mooseGrudge },
      ]);
    expect(validateSetup(grudging(deeId, cop))).toStrictEqual([
      { kind: "strayGrudge", rider: dee.name },
      { kind: "strayGrudge", rider: moose.name },
    ]);
    expect(validateSetup(grudging(mooseId, PLAYER_RIDER))).toStrictEqual([]);
    expect(() => createRace(grudging(deeId, PLAYER_RIDER))).toThrow(dee.name);
  });
});

describe("rider ids", () => {
  it("every rider gets its id once, the player, the rivals in setup order and then the police, and keeps its place all race", () => {
    const setup = defaultSetup(track, 4);
    const state = createRace(setup);
    const { player: me, police, rivals: rivalIds } = rosterOf(setup);
    const ids = state.riders.map((rider) => rider.id);
    expect(ids).toStrictEqual([me, ...rivalIds, ...police]);
    expect(new Set(ids).size).toBe(
      1 + setup.rivals.length + setup.police.count
    );
    expect(
      state.riders
        .filter((rider) => rider.profile.role === "racer")
        .map((rider) => rider.profile.name)
    ).toStrictEqual([
      setup.player.name,
      ...setup.rivals.map((rival) => rival.name),
    ]);
    const seated = [...state.riders];
    const inputs = state.riders.map(() => ({ ...cruising }));
    for (let tick = 0; tick < 60 * TICK_RATE; tick += 1) {
      pilotAll(state, track, inputs);
      stepRace(state, track, inputs);
    }
    expect(state.riders.map((rider) => rider.id)).toStrictEqual(ids);
    for (const rider of state.riders) {
      expect(riderOf(seated, rider.id)).toBe(rider);
    }
  });
});

describe("the grid", () => {
  it("the player starts behind every rival when the grid order puts them last", () => {
    const setup = defaultSetup(track, 1);
    const last = createRace({ ...setup, gridOrder: "playerLast" });
    const first = createRace({ ...setup, gridOrder: "playerFirst" });
    expect(rivalsOf(last)).toHaveLength(5);
    expect(player(last).s).toBeLessThan(Math.min(...rivalsOf(last)));
    expect(player(first).s).toBeGreaterThanOrEqual(
      Math.max(...rivalsOf(first))
    );
  });

  it("the player starts with the weapon and the hits left that the setup carries over", () => {
    const setup = defaultSetup(straight, 1);
    const state = createRace({
      ...setup,
      player: { ...setup.player, weapon: "chain", weaponHits: 3 },
      police: { ...setup.police, count: 0 },
      rivals: setup.rivals.slice(0, 2),
    });
    const me = player(state);
    const moose = rivalIn(state, 1);
    rivalIn(state).s = 900;
    disarm(moose);
    for (const rider of [me, moose]) {
      rider.s = 50;
      rider.speed = 30;
    }
    expect([me.weapon, me.weaponHits]).toStrictEqual(["chain", 3]);
    const events = brawl(state, 8, () => {
      moose.stamina = MAX_STAMINA;
      return [pressing("punch", true), cruising, cruising];
    });
    expect(
      events.filter((event) => event.kind === "hit" && event.weapon === "chain")
    ).toHaveLength(3);
    expect(me.weapon).toBe("none");
  });
});

const fullGrid = (course: Track, seed: number): RaceState => {
  const setup = defaultSetup(course, seed);
  return createRace({
    ...setup,
    player: { ...setup.player, bike: bikes["halden-wren-400"] },
    rivals: cast
      .filter((rival) => rival.racesFrom <= 1)
      .slice(0, 14)
      .map((rival) => rivalAt(rival, 1)),
  });
};

const launch = (state: RaceState, course: Track, seconds: number) => {
  const inputs = state.riders.map(() => ({ ...neutralInput }));
  const crashes: { rider: RiderId; tick: number }[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    for (const rider of state.riders) {
      const input = inputs[rider.id];
      if (input && rider.id === PLAYER_RIDER) {
        Object.assign(input, { ...neutralInput, throttle: 1 });
      } else if (input) {
        pilotInput(state, course, rider, input);
      }
    }
    stepRace(state, course, inputs);
    crashes.push(
      ...state.events.flatMap((event) =>
        event.kind === "crash" ? [{ rider: event.rider, tick }] : []
      )
    );
  }
  return crashes;
};

describe("the start", () => {
  it.each([
    { course: track, lanes: "one lane each way" },
    { course: wideTrack, lanes: "two lanes each way" },
  ])(
    "a player who holds full throttle from the back of a fifteen-rider grid is not thrown in the first ten seconds, and no rival goes down in the first three, with $lanes",
    ({ course }) => {
      for (const seed of [1, 2, 3]) {
        const state = fullGrid(course, seed);
        const crashes = launch(state, course, 10);
        expect(
          crashes.filter((crash) => crash.rider === PLAYER_RIDER)
        ).toStrictEqual([]);
        expect(
          crashes.filter((crash) => crash.tick < 3 * TICK_RATE)
        ).toStrictEqual([]);
        expect(player(state).s).toBeGreaterThan(120);
      }
    }
  );

  it("the pack gets away on its own bikes' curves: three seconds in, the rider ahead of the player is within four metres a second of the player", () => {
    const state = fullGrid(wideTrack, 1);
    const me = player(state);
    launch(state, wideTrack, 3);
    const [ahead] = state.riders
      .filter(
        (rider) =>
          rider.profile.role === "racer" &&
          rider.s > me.s &&
          Math.abs(rider.x - me.x) < 1
      )
      .toSorted((left, right) => left.s - right.s);
    if (!ahead) {
      throw new Error("Nobody is ahead of the player in their lane.");
    }
    expect(me.speed).toBeGreaterThan(10);
    expect(me.speed - ahead.speed).toBeLessThan(4);
  });
});
