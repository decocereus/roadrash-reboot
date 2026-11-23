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
import { snapshotCapacity, writeSnapshot } from "./snapshot.ts";
import {
  PLAYER_RIDER,
  TICK_RATE,
  TICK_SECONDS,
  riderIdAt,
  riderOf,
} from "./state.ts";
import type {
  InputFrame,
  RaceSetup,
  RaceState,
  RiderId,
  RiderInput,
  RiderState,
} from "./state.ts";
import {
  TIMING_LINE_METRES,
  createRaceTiming,
  intervalAhead,
} from "./timing.ts";
import type { IntervalMs, RaceTiming, TimingView } from "./timing.ts";

const braking: RiderInput = { ...neutralInput, brake: 1 };
const RIVAL = riderIdAt(1);

const intervalsOf = (view: RaceView, timing: TimingView): IntervalMs[] => {
  const order = standings(view);
  const read: IntervalMs[] = [];
  for (let place = 1; place < order.length; place += 1) {
    const follower = riderOf(view.riders, order[place] ?? null);
    const ahead = riderOf(view.riders, order[place - 1] ?? null);
    if (follower && ahead) {
      read.push(intervalAhead(timing, view.tick, follower, ahead));
    }
  }
  return read;
};

interface Timed {
  readonly state: RaceState;
  readonly timing: RaceTiming;
  readonly step: (frame: InputFrame) => void;
}

const timedRace = (setup: RaceSetup): Timed => {
  const state = createRace(setup);
  const timing = createRaceTiming(state, setup.track.length);
  return {
    state,
    step: (frame) => {
      stepRace(state, setup.track, frame);
      timing.record(state);
    },
    timing,
  };
};

const pilotedSetup = (seed: number): RaceSetup => {
  const setup = defaultSetup(track, seed);
  return { ...setup, player: { ...setup.player, controller: "pilot" } };
};

const pilotFrame = frameOf(createRace(pilotedSetup(1)));

interface Twins extends Timed {
  readonly leader: RiderState;
  readonly rival: RiderState;
}

const twins = (): Twins => {
  const setup = defaultSetup(straight, 1);
  const race = timedRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: setup.rivals
      .slice(0, 1)
      .map((rival) => ({ ...rival, bike: setup.player.bike })),
  });
  const leader = player(race.state);
  const rival = race.state.riders.find((rider) => rider.id !== PLAYER_RIDER);
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
  return { ...race, leader, rival };
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

const timed = (gap: IntervalMs): gap is number => gap !== "unknown";

const broken = (gap: IntervalMs): boolean =>
  timed(gap) && !(Number.isInteger(gap) && gap >= 0);

const asSeconds = (gap: IntervalMs): number => {
  if (gap === "unknown") {
    throw new TypeError("The interval reads unknown, not a time.");
  }
  return gap / 1000;
};

interface Ride {
  readonly throwAt: number | null;
  readonly waitTicks: number;
}

const errorsBehind = ({ throwAt, waitTicks }: Ride): number[] => {
  const { leader, rival, state, step, timing } = twins();
  const trail: number[] = [leader.bodyS];
  const errors: number[] = [];
  let thrown = false;
  for (let tick = 0; tick < 40 * TICK_RATE; tick += 1) {
    if (throwAt !== null && !thrown && leader.bodyS > throwAt) {
      leader.stamina = 0;
      thrown = true;
    }
    step(
      frameOf(
        state,
        [
          leader.id,
          throwAt === null ? flatOut : towardTheBike(leader, flatOut),
        ],
        [rival.id, tick < waitTicks ? braking : flatOut]
      )
    );
    trail.push(leader.bodyS);
    const crossing = crossingOf(trail, rival.bodyS);
    if (crossing !== null && rival.bodyS > 100) {
      const truth = (state.tick - crossing) * TICK_SECONDS;
      errors.push(
        asSeconds(intervalAhead(timing, state.tick, rival, leader)) - truth
      );
    }
  }
  return errors;
};

const worst = (errors: readonly number[]): number =>
  Math.max(...errors.map(Math.abs));

describe("the interval to the rider ahead", () => {
  it("is the time since the rider ahead passed the follower's spot on the road", () => {
    const errors = errorsBehind({ throwAt: null, waitTicks: 90 });
    expect(errors.length).toBeGreaterThan(20 * TICK_RATE);
    expect(worst(errors)).toBeLessThan(0.02);
  });

  it("stays near the true time while the follower rides past where the rider ahead fell", () => {
    const rides = Array.from({ length: 10 }, (_, metre) =>
      errorsBehind({ throwAt: 400 + metre, waitTicks: 900 })
    );
    expect(Math.min(...rides.map((errors) => errors.length))).toBeGreaterThan(
      20 * TICK_RATE
    );
    expect(Math.max(...rides.map(worst))).toBeLessThan(0.15);
    expect(
      Math.max(
        ...rides.map(
          (errors) => errors.filter((error) => Math.abs(error) > 0.1).length
        )
      )
    ).toBeLessThanOrEqual(1);
  });

  it("stays blank on the grid until the follower reaches a line the rider ahead rode across", () => {
    const race = timedRace(pilotedSetup(2));
    const onTheGrid = intervalsOf(race.state, race.timing);
    const beforeTheLine = new Set<IntervalMs>();
    let timedReads = 0;
    for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
      race.step(pilotFrame);
      const order = standings(race.state);
      for (let place = 1; place < order.length; place += 1) {
        const follower = riderOf(race.state.riders, order[place] ?? null);
        const ahead = riderOf(race.state.riders, order[place - 1] ?? null);
        const gap =
          follower && ahead
            ? intervalAhead(race.timing, race.state.tick, follower, ahead)
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
    expect(intervalsOf(race.state, race.timing).filter(timed)).toHaveLength(
      onTheGrid.length
    );
  });

  it("never reads a negative or broken time across a whole pack race", () => {
    const race = timedRace(pilotedSetup(5));
    const wrong: IntervalMs[] = [];
    let timedReads = 0;
    for (let tick = 0; tick < 4 * 60 * TICK_RATE; tick += 1) {
      race.step(pilotFrame);
      const gaps = intervalsOf(race.state, race.timing);
      timedReads += gaps.filter(timed).length;
      wrong.push(...gaps.filter(broken));
    }
    expect(wrong).toStrictEqual([]);
    expect(timedReads).toBeGreaterThan(60 * TICK_RATE);
  });

  it("keeps the first crossing when a thrown rider slides past a line and walks back", () => {
    const { leader, rival, state, step, timing } = twins();
    const line = 80 * TIMING_LINE_METRES;
    let thrown = false;
    let slidPast = -1;
    let walkedBack = false;
    let rodeOn = false;
    const leaders = new Set<RiderId | undefined>();
    const wrong: IntervalMs[] = [];
    for (let tick = 0; tick < 30 * TICK_RATE; tick += 1) {
      if (!thrown && leader.bodyS > line - 70) {
        leader.stamina = 0;
        thrown = true;
      }
      if (slidPast < 0 && leader.mode === "lying") {
        leader.bodyS = line + 2;
      }
      step(
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
      rodeOn ||= walkedBack && leader.bodyS > line + 10 * TIMING_LINE_METRES;
      leaders.add(standings(state)[0]);
      const gap = intervalAhead(timing, state.tick, rival, leader);
      if (broken(gap)) {
        wrong.push(gap);
      }
    }
    expect([walkedBack, rodeOn]).toStrictEqual([true, true]);
    expect(leaders).toStrictEqual(new Set([leader.id]));
    expect(wrong).toStrictEqual([]);
    const atTheLine = { ...rival, bodyS: line };
    expect(intervalAhead(timing, state.tick, atTheLine, leader)).toBe(
      Math.round((state.tick - slidPast) * TICK_SECONDS * 1000)
    );
  });

  it("reads a finished pair by their finishing ticks", () => {
    const { leader, rival, state, timing } = twins();
    leader.finishTick = 600;
    rival.finishTick = 690;
    expect(intervalAhead(timing, state.tick, rival, leader)).toBe(1500);
  });
});

const weaving = (tick: number, every: number) =>
  controlOf({
    ...neutralInput,
    steer: Math.floor(tick / every) % 2 === 0 ? 0.3 : -0.3,
    throttle: tick % 40 === 0 ? 0 : 1,
  });

const LEAD_TICKS = 30;

const surging = (tick: number) =>
  controlOf({
    ...neutralInput,
    brake: Math.floor(tick / 9) % 2 === 0 ? 0 : 1,
    throttle: Math.floor(tick / 9) % 2 === 0 ? 1 : 0,
  });

const crossingsOf = (client: RoomClient): number[][] =>
  client.predicted.riders.map((rider) =>
    Array.from({ length: client.timing.reached(rider.id) + 1 }, (_, line) =>
      client.timing.crossing(rider.id, line)
    )
  );

const shownIntervals = (client: RoomClient): IntervalMs[] => {
  client.settle();
  return intervalsOf(client.predicted, client.timing);
};

const roomRace = (ticks: number) => {
  const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER, RIVAL]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const step = (tick: number) => {
    room.accept(PLAYER_RIDER, tick, [weaving(tick, 25)]);
    room.accept(RIVAL, tick, [surging(tick)]);
    room.step();
    return room.frame;
  };
  return { room, setup, step, ticks };
};

describe("the interval on a room client", () => {
  it("reads after its rollbacks exactly what a client that never guessed wrong reads", () => {
    const { setup, step, ticks } = roomRace(20 * TICK_RATE);
    const guessed = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
    const told = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
    for (let tick = 1; tick <= ticks; tick += 1) {
      while (guessed.predicted.tick < tick + LEAD_TICKS) {
        guessed.predict(weaving(guessed.predicted.tick + 1, 25));
      }
      const frame = step(tick);
      guessed.confirm(frame, null);
      guessed.settle();
      told.confirm(frame, null);
    }
    while (told.predicted.tick < ticks + LEAD_TICKS) {
      told.predict(weaving(told.predicted.tick + 1, 25));
    }
    const heard = shownIntervals(told);
    expect([
      guessed.stats.rollbacks > 10,
      told.stats.rollbacks,
      guessed.predicted.tick - told.predicted.tick,
    ]).toStrictEqual([true, 0, 0]);
    expect(shownIntervals(guessed)).toStrictEqual(heard);
    expect(crossingsOf(guessed)).toStrictEqual(crossingsOf(told));
    expect(heard.filter(timed).length).toBeGreaterThan(1);
  });

  it("shows blank gaps after a rejoin, then the gaps a client that stayed reads", () => {
    const { room, setup, step, ticks } = roomRace(80 * TICK_RATE);
    const stayed = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
    const rejoined = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
    const half = ticks / 4;
    const reads: IntervalMs[][] = [];
    for (let tick = 1; tick <= ticks; tick += 1) {
      const frame = step(tick);
      stayed.confirm(frame, null);
      if (tick === half) {
        const snapshot = new DataView(
          new ArrayBuffer(snapshotCapacity(room.state))
        );
        writeSnapshot(room.state, setupDigest(room.state, track), snapshot);
        rejoined.catchUpFrom(snapshot);
        reads.push(shownIntervals(rejoined));
      } else if (tick > half) {
        rejoined.confirm(frame, null);
      }
    }
    const [atRejoin = []] = reads;
    expect(new Set(atRejoin)).toStrictEqual(new Set(["unknown"]));
    const settled = shownIntervals(stayed);
    const sinceRejoin = (ticks - half) * TICK_SECONDS;
    const passedBeforeRejoin = settled.map(
      (gap) => !timed(gap) || asSeconds(gap) > sinceRejoin
    );
    const after = shownIntervals(rejoined);
    expect(after).toStrictEqual(
      settled.map((gap, at) =>
        passedBeforeRejoin[at] === true ? "unknown" : gap
      )
    );
    expect(after.filter(timed).length).toBeGreaterThan(1);
  });
});
