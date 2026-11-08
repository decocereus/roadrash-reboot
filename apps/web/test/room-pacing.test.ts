import { INPUT_HORIZON } from "@racer/sim/room";
import { createRoomClock } from "@racer/sim/room-clock";
import { TICK_SECONDS } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createFixedTick } from "../src/game/fixed-tick.ts";

const TICK_MS = TICK_SECONDS * 1000;
const START_MS = 1000;
const PING_EVERY_MS = 500;
const SETTLED_AFTER_MS = START_MS + 3000;
const RIDE_MS = 60_000;

interface Link {
  readonly downMs: (sentAt: number) => number;
  readonly roomHz: (at: number) => number;
  readonly upMs: (sentAt: number) => number;
}

interface Ride {
  readonly fastest: number;
  readonly lateShare: number;
  readonly leaps: number;
  readonly mostAhead: number;
  readonly slowest: number;
  readonly stops: number;
}

const steadyHz = (): number => 60;

const fixedDelay = (ms: number) => (): number => ms;

const heldEvery =
  (baseMs: number, everyMs: number, holeMs: number) =>
  (sentAt: number): number => {
    const into = sentAt % everyMs;
    return baseMs + (into < holeMs ? holeMs - into : 0);
  };

const cutOff =
  (baseMs: number, fromMs: number, untilMs: number) =>
  (sentAt: number): number =>
    sentAt >= fromMs && sentAt < untilMs ? untilMs - sentAt + baseMs : baseMs;

const PARK_MILLER = 16_807;
const MERSENNE_31 = 2_147_483_647;

const shaky = (baseMs: number, spreadMs: number, seed: number) => {
  const memo = new Map<number, number>();
  let state = seed;
  return (sentAt: number): number => {
    const slot = Math.floor(sentAt / 50);
    const known = memo.get(slot);
    if (known !== undefined) {
      return known;
    }
    state = (state * PARK_MILLER) % MERSENNE_31;
    const roll = state / MERSENNE_31;
    const spike = roll > 0.99 ? spreadMs * 1000 * (roll - 0.99) : 0;
    const delay = baseMs + spreadMs * roll + spike;
    memo.set(slot, delay);
    return delay;
  };
};

const lossy = (seed: number) => {
  const memo = new Map<number, number>();
  let state = seed;
  const roll = (): number => {
    state = (state * PARK_MILLER) % MERSENNE_31;
    return state / MERSENNE_31;
  };
  return (sentAt: number): number => {
    const key = Math.round(sentAt);
    const known = memo.get(key);
    if (known !== undefined) {
      return known;
    }
    const delay =
      heldEvery(65, 500, 100)(sentAt) +
      (roll() - 0.5) * 40 +
      (roll() < 0.01 ? 130 + 50 : 0);
    memo.set(key, delay);
    return delay;
  };
};

const ratesFrom =
  (spans: readonly (readonly [number, number])[]) =>
  (at: number): number => {
    let hz = 60;
    for (const [fromMs, spanHz] of spans) {
      if (at >= fromMs) {
        hz = spanHz;
      }
    }
    return hz;
  };

const emitTimes = (link: Link): number[] => {
  const times = [START_MS];
  while ((times.at(-1) ?? 0) < RIDE_MS + 2000) {
    const last = times.at(-1) ?? 0;
    times.push(last + 1000 / link.roomHz(last));
  }
  return times;
};

const arrivalTimes = (link: Link, emitted: readonly number[]): number[] => {
  const arrived: number[] = [];
  let latest = 0;
  for (const at of emitted) {
    latest = Math.max(latest, at + link.downMs(at));
    arrived.push(latest);
  }
  return arrived;
};

const ride = (link: Link, displayHz: number): Ride => {
  const emitted = emitTimes(link);
  const arrived = arrivalTimes(link, emitted);
  const clock = createRoomClock();
  clock.heardRoomTime(0, link.downMs(0));
  clock.start(START_MS);
  const frameMs = 1000 / displayHz;
  const fixed = { accumulator: 0, clockReset: false };
  const sentAt: number[] = [];
  let now = 0;
  let heard = 0;
  let confirmed = 0;
  let predicted = 0;
  let before = 0;
  let after = 0;
  let nextPing = 0;
  const pongs: (readonly [number, number])[] = [];
  const advance = createFixedTick(
    fixed,
    () => false,
    () => {
      before = predicted;
      predicted += clock.stepsDue(predicted, confirmed, now);
      predicted = Math.max(predicted, confirmed);
      after = predicted;
      for (let tick = before + 1; tick <= after; tick += 1) {
        sentAt[tick] = now;
      }
    },
    () => clock.pace(predicted, confirmed, now)
  );
  let drawn = 0;
  let fastest = 0;
  let slowest = Number.POSITIVE_INFINITY;
  let stops = 0;
  let leaps = 0;
  let mostAhead = 0;
  for (now = 0; now < RIDE_MS; now += frameMs) {
    while (heard < arrived.length && (arrived[heard] ?? 0) <= now) {
      clock.heardTick(heard, arrived[heard] ?? now);
      confirmed = heard;
      heard += 1;
    }
    while (nextPing <= now) {
      const up = link.upMs(nextPing);
      const back = nextPing + up + link.downMs(nextPing + up);
      pongs.push([nextPing, back]);
      nextPing += PING_EVERY_MS;
    }
    for (let at = pongs.length - 1; at >= 0; at -= 1) {
      const [sent, back] = pongs[at] ?? [0, 0];
      if (back <= now) {
        clock.heardRtt(back - sent);
        pongs.splice(at, 1);
      }
    }
    advance(frameMs / 1000);
    const nextDrawn =
      before + (after - before) * (fixed.accumulator / TICK_SECONDS);
    const moved = (nextDrawn - drawn) / (frameMs / TICK_MS);
    drawn = nextDrawn;
    if (now >= SETTLED_AFTER_MS) {
      fastest = Math.max(fastest, moved);
      slowest = Math.min(slowest, moved);
      stops += moved <= 0 ? 1 : 0;
      leaps += moved > 2 ? 1 : 0;
      mostAhead = Math.max(mostAhead, predicted - confirmed);
    }
  }
  let late = 0;
  let counted = 0;
  for (let tick = 0; tick < sentAt.length; tick += 1) {
    const sent = sentAt[tick];
    const steppedAt = emitted[tick];
    if (
      sent !== undefined &&
      steppedAt !== undefined &&
      sent >= SETTLED_AFTER_MS
    ) {
      counted += 1;
      late += sent + link.upMs(sent) > steppedAt ? 1 : 0;
    }
  }
  return {
    fastest,
    lateShare: late / Math.max(1, counted),
    leaps,
    mostAhead,
    slowest,
    stops,
  };
};

const steady: Link = {
  downMs: fixedDelay(75),
  roomHz: steadyHz,
  upMs: fixedDelay(75),
};

const homeWifi: Link = {
  downMs: heldEvery(62, 500, 100),
  roomHz: steadyHz,
  upMs: fixedDelay(62),
};

const homeHole = heldEvery(0, 500, 100);
const homeDown = shaky(50, 40, 7);

const jitteryHome: Link = {
  downMs: (sentAt) => homeHole(sentAt) + homeDown(sentAt),
  roomHz: steadyHz,
  upMs: shaky(50, 40, 11),
};

const lagProxy: Link = {
  downMs: lossy(3),
  roomHz: steadyHz,
  upMs: lossy(5),
};

const slowRoom: Link = {
  downMs: fixedDelay(70),
  roomHz: ratesFrom([
    [5000, 57],
    [25_000, 63],
    [45_000, 60],
  ]),
  upMs: fixedDelay(70),
};

const stalledRoom: Link = {
  downMs: fixedDelay(70),
  roomHz: ratesFrom([
    [10_000, 54],
    [20_000, 66],
    [30_000, 60],
  ]),
  upMs: fixedDelay(70),
};

const proxySpike: Link = {
  downMs: cutOff(80, 20_000, 21_000),
  roomHz: steadyHz,
  upMs: cutOff(80, 20_000, 21_000),
};

describe("a room race on a rough link", () => {
  it.each([
    ["a steady 150 ms round trip", steady, 60],
    [
      "a home Wi-Fi link that holds every packet for 100 ms twice a second",
      homeWifi,
      60,
    ],
    ["the same Wi-Fi link on a 120 Hz screen", homeWifi, 120],
    [
      "a home link whose round trip swings from 100 ms to past 400 ms",
      jitteryHome,
      60,
    ],
    [
      "the rooms:lag proxy at 130 ms, 40 ms jitter, 1% loss and a 100 ms hold twice a second",
      lagProxy,
      60,
    ],
    ["a room that sends 57 ticks a second for 20 s, then 63", slowRoom, 60],
    ["a room that sends 54 ticks a second for 10 s, then 66", stalledRoom, 60],
  ] as const)(
    "moves the race on screen at a steady speed over %s",
    (_name, link, displayHz) => {
      const result = ride(link, displayHz);
      expect({ leaps: result.leaps, stops: result.stops }).toStrictEqual({
        leaps: 0,
        stops: 0,
      });
      expect(result.slowest).toBeGreaterThanOrEqual(0.89);
      expect(result.fastest).toBeLessThanOrEqual(1.11);
      expect(result.mostAhead).toBeLessThan(INPUT_HORIZON / 2);
      expect(result.lateShare).toBeLessThan(0.01);
    }
  );

  it("slows down rather than stopping through a one-second cut, and never leaps", () => {
    const result = ride(proxySpike, 60);
    expect(result.stops).toBe(0);
    expect(result.leaps).toBe(0);
    expect(result.mostAhead).toBeLessThan(INPUT_HORIZON);
  });
});
