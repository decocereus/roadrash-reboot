import { TICK_SECONDS } from "@racer/sim/state";
import { beforeAll, describe, expect, it } from "vitest";

import { createFixedTick } from "../src/game/fixed-tick.ts";
import { createHost, createTicker, VSYNC_MS } from "./hosts.ts";

const TICKS = 240;
const RIDE_SECONDS = TICKS * TICK_SECONDS;

const repeated = (seconds: number, count: number): number[] =>
  Array.from({ length: count }, () => seconds);

const uneven = (): number[] => {
  const cycle = [0.004, 0.021, 0.0095, 0.0322, 0.0003];
  const frames: number[] = [];
  let total = 0;
  while (total < RIDE_SECONDS) {
    const seconds = cycle[frames.length % cycle.length] ?? 0;
    frames.push(seconds);
    total += seconds;
  }
  return frames;
};

interface Ride {
  readonly digests: readonly string[];
  readonly idle: number;
  readonly stepped: number;
}

const rideFrames = (frames: readonly number[]): Ride => {
  const ticker = createTicker();
  const clock = { accumulator: 0, clockReset: false };
  const advance = createFixedTick(clock, () => false, ticker.tick);
  let stepped = 0;
  let idle = 0;
  for (const seconds of frames) {
    const ticks = advance(seconds);
    stepped += ticks;
    idle += ticks === 0 ? 1 : 0;
  }
  return { digests: ticker.digests, idle, stepped };
};

const counted = () => {
  const clock = { accumulator: 0, clockReset: false };
  const state = { halted: false, ticks: 0 };
  return { clock, state };
};

describe("the fixed tick", () => {
  const ticks = TICKS;
  let reference: Ride;

  beforeAll(() => {
    reference = rideFrames(repeated(TICK_SECONDS, ticks));
  });

  it("one tick's time per frame steps the race once per frame", () => {
    expect(reference.stepped).toBe(ticks);
    expect(reference.digests).toHaveLength(ticks);
    expect(reference.idle).toBe(0);
  });

  it("half-tick frames step the same race, drawing every other frame without a tick", () => {
    const halves = rideFrames(repeated(TICK_SECONDS / 2, ticks * 2));
    expect(halves.idle).toBe(ticks);
    expect(halves.digests).toStrictEqual(reference.digests);
  });

  it("catch-up frames of three ticks step the same race", () => {
    const catchUp = rideFrames(repeated(TICK_SECONDS * 3, ticks / 3));
    expect(catchUp.stepped).toBe(ticks);
    expect(catchUp.digests).toStrictEqual(reference.digests);
  });

  it("uneven frames step the same race over the ticks they complete", () => {
    const ragged = rideFrames(uneven());
    expect(ragged.idle).toBeGreaterThan(0);
    expect(ragged.stepped).toBe(ragged.digests.length);
    expect(ragged.stepped).toBeGreaterThanOrEqual(ticks);
    expect(ragged.digests.slice(0, ticks)).toStrictEqual(reference.digests);
  });

  it("carries leftover time into the next frame", () => {
    const { clock, state } = counted();
    const advance = createFixedTick(
      clock,
      () => false,
      () => {
        state.ticks += 1;
      }
    );
    expect(advance(TICK_SECONDS)).toBe(1);
    expect(clock.accumulator).toBe(0);
    expect(advance(TICK_SECONDS * 0.75)).toBe(0);
    expect(advance(TICK_SECONDS * 0.5)).toBe(1);
    expect(clock.accumulator / TICK_SECONDS).toBeCloseTo(0.25, 9);
  });

  it("stops stepping when a tick halts the race, and keeps the time it did not use", () => {
    const { clock, state } = counted();
    const advance = createFixedTick(
      clock,
      () => state.halted,
      () => {
        state.ticks += 1;
        state.halted = state.ticks === 2;
      }
    );
    expect(advance(TICK_SECONDS * 5)).toBe(2);
    expect(clock.accumulator / TICK_SECONDS).toBeCloseTo(3, 9);
    expect(advance(TICK_SECONDS)).toBe(0);
  });

  it("drops carried time when the clock is reset before a frame", () => {
    const { clock, state } = counted();
    const advance = createFixedTick(
      clock,
      () => false,
      () => {
        state.ticks += 1;
      }
    );
    advance(TICK_SECONDS * 0.9);
    clock.clockReset = true;
    expect(advance(TICK_SECONDS)).toBe(1);
    expect(clock.accumulator).toBe(0);
    expect(clock.clockReset).toBeFalsy();
  });

  it("ends a frame early when a tick resets the clock", () => {
    const { clock, state } = counted();
    const advance = createFixedTick(
      clock,
      () => false,
      () => {
        state.ticks += 1;
        clock.clockReset = state.ticks === 2;
      }
    );
    expect(advance(TICK_SECONDS * 4)).toBe(2);
    expect(advance(TICK_SECONDS)).toBe(1);
    expect(clock.accumulator).toBe(0);
  });
});

describe("the frame loop's clock", () => {
  it("clamps a stalled frame to a tenth of a second and discards the rest", () => {
    const host = createHost();
    host.at(VSYNC_MS);
    const before = host.digests.length;
    host.at(VSYNC_MS + 250);
    expect(before).toBe(1);
    expect(host.digests.length - before).toBe(6);
  });

  it("a paused race steps nothing, and resumes one frame later", () => {
    const host = createHost();
    for (let frame = 1; frame <= 60; frame += 1) {
      host.at(frame * VSYNC_MS);
    }
    const paused = host.digests.length;
    host.halt(true);
    for (let frame = 61; frame <= 180; frame += 1) {
      host.at(frame * VSYNC_MS);
    }
    expect(host.digests).toHaveLength(paused);
    host.halt(false);
    host.frame.clockReset = true;
    host.at(181 * VSYNC_MS);
    expect(host.digests.length - paused).toBe(1);
  });

  it("time from callbacks the pacer skips reaches the race on the next drawn frame", () => {
    const paced = createHost();
    const steady = createHost();
    paced.frameRate("30");
    const idle: number[] = [];
    for (let frame = 1; frame <= 240; frame += 1) {
      const before = paced.digests.length;
      paced.at(frame * VSYNC_MS);
      steady.at(frame * VSYNC_MS);
      idle.push(paced.digests.length === before ? 1 : 0);
    }
    const common = Math.min(paced.digests.length, steady.digests.length);
    expect(idle.reduce((sum, each) => sum + each, 0)).toBeGreaterThan(100);
    expect(common).toBeGreaterThan(230);
    expect(paced.digests.slice(0, common)).toStrictEqual(
      steady.digests.slice(0, common)
    );
  });
});
