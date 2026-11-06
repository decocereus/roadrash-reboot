import { controlOf } from "@racer/sim/control";
import {
  inputBytes,
  RACE_STATS_PACKET_BYTES,
  READY_PACKET_BYTES,
  writeInput,
  writeRaceStats,
  writeReady,
} from "@racer/sim/room-wire";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { SEAT_QUIT } from "../src/messages.ts";
import {
  advanceHearing,
  AWAY_MS,
  countdownsOn,
  createClock,
  fakeSocket,
  loadingRace,
  nearby,
  race,
  readyAll,
  readyPacket,
  sameBuild,
  someRaceStats,
  START_DELAY_MS,
  TICK_MS,
} from "./host-harness.ts";

const LOAD_DEADLINE_MS = 20_000;

const inputPacket = (firstTick: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(inputBytes(1));
  writeInput(new DataView(buffer), firstTick, [
    controlOf({
      brake: 0,
      kick: false,
      punch: false,
      remount: false,
      steer: 0,
      throttle: 1,
    }),
  ]);
  return buffer;
};

const statsPacket = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(RACE_STATS_PACKET_BYTES);
  writeRaceStats(new DataView(buffer), someRaceStats);
  return buffer;
};

const wrongReadyPacket = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(READY_PACKET_BYTES);
  writeReady(new DataView(buffer), new Uint32Array(HASH_WORDS));
  return buffer;
};

const endedNote = (notes: ReturnType<typeof createClock>["notes"]) => {
  const ended = notes.find((note) => note.kind === "ended");
  if (ended?.kind !== "ended") {
    throw new Error("The race never ended.");
  }
  return ended;
};

describe("a race's way through the room host", () => {
  it("reads as a race from the moment it is built, with no ticks before the start moment", () => {
    const { clock, far, host, near } = loadingRace();
    const beforeTheStart = {
      lagTicks: 0,
      phase: "racing",
      raceId: "race-1",
      tick: 0,
      wakes: 0,
    };
    const atEachStep = [host.status()];
    host.message(near, readyPacket(near));
    host.message(far, readyPacket(far));
    atEachStep.push(host.status());
    clock.advance(START_DELAY_MS - 1);
    atEachStep.push(host.status());
    expect(atEachStep).toMatchObject([
      beforeTheStart,
      beforeTheStart,
      beforeTheStart,
    ]);
    expect(atEachStep[0]?.seats).toHaveLength(2);
    clock.advance(TICK_MS * 3);
    expect(host.status().tick).toBeGreaterThanOrEqual(1);
    expect(host.status().wakes).toBeGreaterThanOrEqual(1);
  });

  it("forgets the race once it ends but keeps its wake counts until the next is built", () => {
    const clock = createClock();
    const host = createHost(clock);
    const rider = fakeSocket();
    race(host, clock, [rider]);
    clock.advance(TICK_MS * 30);
    host.gone(rider, SEAT_QUIT);
    clock.advance(1000);
    expect(host.status()).toMatchObject({
      lagTicks: 0,
      phase: "waiting",
      raceId: null,
      seats: [],
      tick: 0,
    });
    expect(host.status().wakes).toBeGreaterThan(0);
    clock.advance(AWAY_MS + 1000);
    const next = fakeSocket();
    host.seat(next, "Next", nearby, sameBuild());
    readyAll(host, [next]);
    expect(host.status()).toMatchObject({
      catchUpWakes: 0,
      phase: "racing",
      raceId: "race-2",
      wakes: 0,
      worstBehindTicks: 0,
    });
  });

  it("reads lag only once it is riding, and catches it up", () => {
    const clock = createClock();
    const host = createHost(clock);
    const rider = fakeSocket();
    race(host, clock, [rider]);
    clock.advance(TICK_MS * 2);
    clock.stall(TICK_MS * 30);
    expect(host.status().lagTicks).toBeGreaterThanOrEqual(29);
    clock.advance(TICK_MS);
    expect(host.status().lagTicks).toBeLessThanOrEqual(1);
  });

  it("does not let a dead race's load deadline hurry the next race's load", () => {
    const clock = createClock();
    const host = createHost(clock);
    const first = fakeSocket();
    const second = fakeSocket();
    host.seat(first, "Ann", nearby, sameBuild("ann"));
    host.seat(second, "Bo", nearby, sameBuild("bo"));
    readyAll(host, [first, second]);
    host.gone(first, SEAT_QUIT);
    host.gone(second, SEAT_QUIT);
    clock.advance(START_DELAY_MS + 1000);
    expect(host.status().phase).toBe("waiting");
    const backFirst = fakeSocket();
    const backSecond = fakeSocket();
    host.seat(backFirst, "Ann", nearby, sameBuild("ann"));
    host.seat(backSecond, "Bo", nearby, sameBuild("bo"));
    readyAll(host, [backFirst, backSecond]);
    expect(host.status().raceId).toBe("race-2");
    host.message(backFirst, readyPacket(backFirst));
    const sockets = [backFirst, backSecond];
    advanceHearing(host, clock, sockets, LOAD_DEADLINE_MS - 1000);
    expect(countdownsOn(backFirst)).toBe(0);
    advanceHearing(host, clock, sockets, 1000);
    expect(countdownsOn(backFirst)).toBe(1);
  });

  it("counts down once, however late a seat loads", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    advanceHearing(host, clock, [far, near], LOAD_DEADLINE_MS);
    clock.advance(1000);
    host.message(far, readyPacket(far));
    clock.advance(START_DELAY_MS);
    host.message(far, readyPacket(far));
    clock.advance(1000);
    expect([countdownsOn(near), countdownsOn(far)]).toStrictEqual([1, 1]);
    expect(host.status().tick).toBeGreaterThan(50);
    expect(host.status().wakes).toBeLessThan(host.status().tick * 1.5);
  });

  it("records when a late seat loaded, and not again if it says so twice", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    advanceHearing(host, clock, [far, near], LOAD_DEADLINE_MS);
    clock.advance(1000);
    host.message(far, readyPacket(far));
    clock.advance(START_DELAY_MS);
    host.message(far, readyPacket(far));
    host.gone(near, SEAT_QUIT);
    host.gone(far, SEAT_QUIT);
    clock.advance(1000);
    expect(endedNote(clock.notes).seats).toMatchObject([
      { readyMs: 0, rider: 0 },
      { readyMs: LOAD_DEADLINE_MS + 1000, rider: 1 },
    ]);
  });

  it.each([
    ["counts down", 0],
    ["rides", START_DELAY_MS + 1000],
  ])(
    "refuses a load that does not match while the race %s, and rides on",
    (_case, afterCountdownMs) => {
      const { clock, far, host, near } = loadingRace();
      host.message(near, readyPacket(near));
      advanceHearing(host, clock, [far, near], LOAD_DEADLINE_MS);
      clock.advance(afterCountdownMs);
      host.message(far, wrongReadyPacket());
      expect(far.messages.at(-1)).toStrictEqual({
        kind: "refused",
        reason: "content",
      });
      expect(host.status().phase).toBe("racing");
      expect(host.status().seats).toHaveLength(1);
      expect(clock.notes.filter((note) => note.kind === "left")).toHaveLength(
        1
      );
    }
  );

  it("takes a rider's controls while the race loads and while it counts down", () => {
    const { far, host, near } = loadingRace();
    host.message(near, inputPacket(1));
    expect(host.status().seats[0]?.accepted).toBe(1);
    host.message(near, readyPacket(near));
    host.message(far, readyPacket(far));
    host.message(near, inputPacket(2));
    expect(host.status().seats[0]?.accepted).toBe(2);
  });

  it("keeps a rider's race numbers from the moment the race is built", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, statsPacket());
    host.message(far, readyPacket(far));
    host.message(near, readyPacket(near));
    host.message(far, statsPacket());
    host.gone(near, SEAT_QUIT);
    host.gone(far, SEAT_QUIT);
    expect(clock.notes.filter((note) => note.kind === "stats")).toHaveLength(2);
  });

  it.each([
    ["loads", false],
    ["counts down", true],
  ])(
    "runs out the start when every seat leaves while the race %s, then ends on its first tick",
    (_case, loaded) => {
      const { clock, far, host, near } = loadingRace();
      if (loaded) {
        host.message(near, readyPacket(near));
        host.message(far, readyPacket(far));
      }
      host.gone(near, SEAT_QUIT);
      host.gone(far, SEAT_QUIT);
      clock.advance(START_DELAY_MS - 1);
      expect(host.status().phase).toBe("racing");
      clock.advance(100);
      expect(host.status().phase).toBe("waiting");
      expect(endedNote(clock.notes).tick).toBe(1);
    }
  );

  it("measures the first gap between wakes from the start moment", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    host.message(far, readyPacket(far));
    clock.advance(START_DELAY_MS - 1);
    clock.stall(71);
    clock.wakeOnce();
    const { wakes } = host.status();
    expect(wakes).toBe(1);
    host.gone(near, SEAT_QUIT);
    host.gone(far, SEAT_QUIT);
    clock.advance(1000);
    const { wakeGaps } = endedNote(clock.notes);
    expect(wakeGaps[3]).toBe(1);
    expect(wakeGaps[4]).toBe(0);
    expect(wakeGaps.reduce((total, gap) => total + gap, 0)).toBe(
      host.status().wakes
    );
  });

  it("ignores race packets from a member who is not in the race", () => {
    const { clock, host, near } = loadingRace();
    const late = fakeSocket();
    host.seat(late, "Late", nearby, sameBuild());
    host.message(late, readyPacket(near));
    host.message(late, inputPacket(1));
    host.message(late, statsPacket());
    host.message(
      late,
      JSON.stringify({ build: "abc", gpu: "g", graphics: "q", rows: [] })
    );
    expect(countdownsOn(near)).toBe(0);
    expect(host.status().seats.map((seat) => seat.accepted)).toStrictEqual([
      0, 0,
    ]);
    host.gone(late, SEAT_QUIT);
    expect(host.status().seats).toHaveLength(2);
    expect(clock.notes.map((note) => note.kind)).toStrictEqual(["started"]);
  });

  it("ignores race packets while no race is on", () => {
    const clock = createClock();
    const host = createHost(clock);
    const walker = fakeSocket();
    host.seat(walker, "Walker", nearby, sameBuild());
    host.message(walker, wrongReadyPacket());
    host.message(walker, inputPacket(1));
    host.message(walker, statsPacket());
    host.message(
      walker,
      JSON.stringify({ build: "abc", gpu: "g", graphics: "q", rows: [] })
    );
    expect(host.status()).toMatchObject({
      phase: "waiting",
      raceId: null,
      seats: [],
    });
    expect(walker.closed).toBeNull();
    host.gone(walker, SEAT_QUIT);
    expect(clock.notes).toStrictEqual([]);
  });
});
