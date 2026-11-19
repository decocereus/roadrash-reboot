import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import {
  ROOM_LIMIT_TICKS,
  flatOut,
  frameOf,
  player,
  straight,
  towardTheBike,
  track,
} from "./race-fixtures.ts";
import type { RaceView } from "./race-view.ts";
import {
  createRace,
  defaultSetup,
  neutralInput,
  standings,
  stepRace,
} from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import type { RoomClient } from "./room-client.ts";
import { createRoom, roomSetup } from "./room.ts";
import { setupDigest } from "./snapshot-setup.ts";
import {
  restoreSnapshot,
  snapshotCapacity,
  writeSnapshot,
} from "./snapshot.ts";
import {
  PLAYER_RIDER,
  TICK_RATE,
  TICK_SECONDS,
  riderIdAt,
  riderOf,
} from "./state.ts";
import type {
  RaceSetup,
  RaceState,
  RiderId,
  RiderInput,
  RiderState,
} from "./state.ts";
import { TIMING_LINE_METRES, TIMING_LINES, intervalAhead } from "./timing.ts";
import type { Interval } from "./timing.ts";

const braking: RiderInput = { ...neutralInput, brake: 1 };
const RIVAL = riderIdAt(1);

const intervalsOf = (view: RaceView): Interval[] => {
  const order = standings(view);
  const read: Interval[] = [];
  for (let place = 1; place < order.length; place += 1) {
    const follower = riderOf(view.riders, order[place] ?? null);
    const ahead = riderOf(view.riders, order[place - 1] ?? null);
    if (follower && ahead) {
      read.push(intervalAhead(view.tick, follower, ahead));
    }
  }
  return read;
};

const pilotedSetup = (seed: number): RaceSetup => {
  const setup = defaultSetup(track, seed);
  return { ...setup, player: { ...setup.player, controller: "pilot" } };
};

const pilotFrame = frameOf(createRace(pilotedSetup(1)));

interface Twins {
  readonly leader: RiderState;
  readonly rival: RiderState;
  readonly state: RaceState;
}

const twins = (): Twins => {
  const setup = defaultSetup(straight, 1);
  const state = createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: setup.rivals
      .slice(0, 1)
      .map((rival) => ({ ...rival, bike: setup.player.bike })),
  });
  const leader = player(state);
  const rival = state.riders.find((rider) => rider.id !== PLAYER_RIDER);
  if (!rival) {
    throw new Error("The race has no rival.");
  }
  for (const rider of [leader, rival]) {
    rider.controller = "human";
    rider.s = 10;
    rider.bodyS = 10;
    rider.speed = 0;
  }
  leader.x = 0.6;
  rival.x = 2.4;
  return { leader, rival, state };
};

const crossingOf = (trail: readonly number[], s: number): number | null => {
  const after = trail.findIndex((at) => at >= s);
  if (after < 1) {
    return null;
  }
  const before = trail[after - 1] ?? 0;
  const at = trail[after] ?? 0;
  return after - 1 + (s - before) / (at - before);
};

const timed = (gap: Interval): gap is number =>
  gap !== "unknown" && gap !== "beyond";

const broken = (gap: Interval): boolean =>
  timed(gap) && !(Number.isFinite(gap) && gap >= 0);

const asSeconds = (gap: Interval): number => {
  if (gap === "unknown" || gap === "beyond") {
    throw new TypeError(`The interval reads ${gap}, not a time.`);
  }
  return gap;
};

describe("the interval to the rider ahead", () => {
  it("is the time since the rider ahead passed the follower's spot on the road", () => {
    const { leader, rival, state } = twins();
    const trail: number[] = [leader.bodyS];
    const errors: number[] = [];
    for (let tick = 0; tick < 30 * TICK_RATE; tick += 1) {
      stepRace(
        state,
        straight,
        frameOf(
          state,
          [leader.id, flatOut],
          [rival.id, tick < 90 ? braking : flatOut]
        )
      );
      trail.push(leader.bodyS);
      const crossing = crossingOf(trail, rival.bodyS);
      if (crossing !== null && rival.bodyS > 2 * TIMING_LINE_METRES) {
        const truth = (state.tick - crossing) * TICK_SECONDS;
        errors.push(
          asSeconds(intervalAhead(state.tick, rival, leader)) - truth
        );
      }
    }
    expect(errors.length).toBeGreaterThan(20 * TICK_RATE);
    expect(Math.max(...errors.map(Math.abs))).toBeLessThan(0.05);
  });

  it("stays blank on the grid until the follower reaches a line the rider ahead rode across", () => {
    const state = createRace(pilotedSetup(2));
    const onTheGrid = intervalsOf(state);
    const beforeTheLine = new Set<Interval>();
    let timedReads = 0;
    for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
      stepRace(state, track, pilotFrame);
      const order = standings(state);
      for (let place = 1; place < order.length; place += 1) {
        const follower = riderOf(state.riders, order[place] ?? null);
        const ahead = riderOf(state.riders, order[place - 1] ?? null);
        const gap =
          follower && ahead
            ? intervalAhead(state.tick, follower, ahead)
            : "unknown";
        if (follower && follower.bodyS < 0) {
          beforeTheLine.add(gap);
        } else if (timed(gap)) {
          timedReads += 1;
        }
      }
    }
    expect(new Set(onTheGrid)).toStrictEqual(new Set(["unknown"]));
    expect(beforeTheLine).toStrictEqual(new Set(["unknown"]));
    expect(timedReads).toBeGreaterThan(0);
    expect(intervalsOf(state).filter(timed)).toHaveLength(onTheGrid.length);
  });

  it("never reads a negative or broken time across a whole pack race", () => {
    const state = createRace(pilotedSetup(5));
    const wrong: Interval[] = [];
    let timedReads = 0;
    for (let tick = 0; tick < 4 * 60 * TICK_RATE; tick += 1) {
      stepRace(state, track, pilotFrame);
      const gaps = intervalsOf(state);
      timedReads += gaps.filter(timed).length;
      wrong.push(...gaps.filter(broken));
    }
    expect(wrong).toStrictEqual([]);
    expect(timedReads).toBeGreaterThan(60 * TICK_RATE);
  });

  it("keeps the first crossing when a thrown rider slides past a line and walks back", () => {
    const { leader, rival, state } = twins();
    const line = 8 * TIMING_LINE_METRES;
    let thrown = false;
    let slidPast = -1;
    let walkedBack = false;
    let rodeOn = false;
    const leaders = new Set<RiderId | undefined>();
    const wrong: Interval[] = [];
    for (let tick = 0; tick < 30 * TICK_RATE; tick += 1) {
      if (!thrown && leader.bodyS > line - 70) {
        leader.stamina = 0;
        thrown = true;
      }
      if (slidPast < 0 && leader.mode === "lying") {
        leader.bodyS = line + 2;
      }
      stepRace(
        state,
        straight,
        frameOf(
          state,
          [leader.id, towardTheBike(leader, flatOut)],
          [rival.id, tick < 900 ? braking : flatOut]
        )
      );
      if (slidPast < 0 && leader.bodyS >= line) {
        slidPast = state.tick;
      }
      walkedBack ||= slidPast >= 0 && leader.bodyS < line;
      rodeOn ||= walkedBack && leader.bodyS > line + TIMING_LINE_METRES;
      leaders.add(standings(state)[0]);
      const gap = intervalAhead(state.tick, rival, leader);
      if (broken(gap)) {
        wrong.push(gap);
      }
    }
    expect([walkedBack, rodeOn]).toStrictEqual([true, true]);
    expect(leaders).toStrictEqual(new Set([leader.id]));
    expect(wrong).toStrictEqual([]);
    const atTheLine = { ...rival, bodyS: line };
    expect(intervalAhead(state.tick, atTheLine, leader)).toBeCloseTo(
      (state.tick - slidPast) * TICK_SECONDS,
      9
    );
  });

  it("says nothing about time once the follower is behind the record of the rider ahead", () => {
    const { leader, rival, state } = twins();
    stepRace(state, straight, frameOf(state));
    rival.s = 2 * TIMING_LINE_METRES + 5;
    stepRace(state, straight, frameOf(state));
    leader.s = (TIMING_LINES + 4) * TIMING_LINE_METRES;
    stepRace(state, straight, frameOf(state));
    expect(intervalAhead(state.tick, rival, leader)).toBe("beyond");
  });

  it("reads a finished pair by their finishing ticks", () => {
    const { leader, rival, state } = twins();
    leader.finishTick = 600;
    rival.finishTick = 690;
    expect(intervalAhead(state.tick, rival, leader)).toBeCloseTo(1.5, 9);
  });

  it("reads the same intervals from a race restored mid-way into a fresh state", () => {
    const setup = pilotedSetup(7);
    const straightThrough = createRace(setup);
    for (let tick = 0; tick < 40 * TICK_RATE; tick += 1) {
      stepRace(straightThrough, track, pilotFrame);
    }
    const buffer = new DataView(
      new ArrayBuffer(snapshotCapacity(straightThrough))
    );
    writeSnapshot(straightThrough, setupDigest(straightThrough, track), buffer);
    const restored = restoreSnapshot(setup, buffer);
    for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
      stepRace(straightThrough, track, pilotFrame);
      stepRace(restored, track, pilotFrame);
      expect(intervalsOf(restored)).toStrictEqual(intervalsOf(straightThrough));
    }
    expect(intervalsOf(restored).filter(timed).length).toBeGreaterThan(0);
  });
});

const weaving = (tick: number, every: number) =>
  controlOf({
    ...neutralInput,
    steer: Math.floor(tick / every) % 2 === 0 ? 0.3 : -0.3,
    throttle: 1,
  });

const settledIntervals = (client: RoomClient): Interval[] => {
  for (let frame = 0; frame < 40; frame += 1) {
    client.settle(60);
  }
  return intervalsOf(client.predicted);
};

describe("the interval on a room client", () => {
  it("reads after a rollback what a client that heard the room first reads", () => {
    const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER, RIVAL]);
    const room = createRoom(setup, ROOM_LIMIT_TICKS);
    const guessed = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
    const told = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
    const lead = 20 * TICK_RATE;
    for (let tick = 1; tick <= lead; tick += 1) {
      guessed.predict(weaving(tick, 25));
    }
    for (let tick = 1; tick <= lead; tick += 1) {
      room.accept(PLAYER_RIDER, tick, [weaving(tick, 25)]);
      room.accept(RIVAL, tick, [weaving(tick, 9)]);
      room.step();
      guessed.confirm(room.frame, null);
      told.confirm(room.frame, null);
    }
    const heard = settledIntervals(told);
    expect(guessed.stats.rollbacks).toBeGreaterThan(0);
    expect(settledIntervals(guessed)).toStrictEqual(heard);
    expect(heard.filter(timed)).toHaveLength(heard.length);
  });
});
