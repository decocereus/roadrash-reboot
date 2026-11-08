import { describe, expect, it } from "vitest";

import { createPacer, createRefreshMeter } from "./pacer.ts";

const PACE = 60;
const STARTING_REFRESH = 60;

type Gaps = readonly [number, ...number[]];

interface Stretch {
  readonly gaps: Gaps;
  readonly ms: number;
}

type Clock = (now: number) => number;

const exact: Clock = (now) => now;
const wholeMs: Clock = Math.floor;

const at = (hertz: number, ms: number): Stretch => ({
  gaps: [1000 / hertz],
  ms,
});

const screen = (clock: Clock) => {
  const readRefresh = createRefreshMeter(STARTING_REFRESH);
  const pacer = createPacer();
  let now = 0;
  let refresh = STARTING_REFRESH;
  const drawn = (gap: number): number => {
    now += gap;
    refresh = readRefresh(clock(now));
    return Number(pacer.due(clock(now), refresh, PACE));
  };
  return {
    refresh: () => refresh,
    ride({ gaps, ms }: Stretch) {
      for (let elapsed = 0, index = 0; elapsed < ms; index += 1) {
        const gap = gaps[index % gaps.length] ?? gaps[0];
        elapsed += gap;
        drawn(gap);
      }
    },
    second(hertz: number): number {
      let frames = 0;
      for (let index = 0; index < hertz; index += 1) {
        frames += drawn(1000 / hertz);
      }
      return frames;
    },
  };
};

const vsync = 1000 / 120;

interface Sequence {
  readonly before: readonly Stretch[];
  readonly clock: Clock;
  readonly drawn: number;
  readonly name: string;
  readonly refresh: number;
}

const sequences: readonly Sequence[] = [
  {
    before: [at(120, 3000), at(165, 3000)],
    clock: exact,
    drawn: 55,
    name: "120 Hz to 165 Hz",
    refresh: 165,
  },
  {
    before: [at(165, 3000), at(120, 3000)],
    clock: exact,
    drawn: 60,
    name: "165 Hz to 120 Hz",
    refresh: 120,
  },
  {
    before: [at(165, 3000), at(144, 3000)],
    clock: exact,
    drawn: 72,
    name: "165 Hz to 144 Hz",
    refresh: 144,
  },
  {
    before: [at(144, 3000), at(120, 3000)],
    clock: exact,
    drawn: 60,
    name: "144 Hz to 120 Hz",
    refresh: 120,
  },
  {
    before: [at(120, 3000), at(100, 3000)],
    clock: exact,
    drawn: 50,
    name: "120 Hz to 100 Hz",
    refresh: 100,
  },
  {
    before: [at(165, 3000), at(144, 3000)],
    clock: wholeMs,
    drawn: 72,
    name: "165 Hz to 144 Hz, read in whole milliseconds",
    refresh: 144,
  },
  {
    before: [
      at(60, 3000),
      { gaps: [1000 / 60, 2000 / 60], ms: 5000 },
      at(30, 5000),
    ],
    clock: exact,
    drawn: 60,
    name: "a 60 Hz screen whose GPU misses vsyncs",
    refresh: 60,
  },
  {
    before: [
      at(120, 3000),
      { gaps: [vsync, 2 * vsync], ms: 5000 },
      at(60, 5000),
    ],
    clock: exact,
    drawn: 60,
    name: "a 120 Hz screen whose GPU misses every other vsync",
    refresh: 120,
  },
  {
    before: [
      { gaps: [vsync, vsync, vsync, vsync, 2 * vsync], ms: 4000 },
      at(40, 4000),
    ],
    clock: exact,
    drawn: 60,
    name: "a 120 Hz screen whose GPU misses vsyncs from the start",
    refresh: 120,
  },
  {
    before: [at(120, 3000), { gaps: [vsync, 2 * vsync], ms: 5000 }],
    clock: wholeMs,
    drawn: 60,
    name: "a 120 Hz screen whose GPU misses vsyncs, read in whole milliseconds",
    refresh: 120,
  },
];

describe("the refresh meter", () => {
  it.each(sequences)(
    "$name draws $drawn frames a second at $refresh Hz",
    ({ before, clock, drawn, refresh }) => {
      const display = screen(clock);
      for (const stretch of before) {
        display.ride(stretch);
      }
      expect({
        drawn: display.second(refresh),
        refresh: display.refresh(),
      }).toStrictEqual({ drawn, refresh });
    }
  );

  it("waits for two readings before it trusts a lower rate", () => {
    const display = screen(exact);
    display.ride(at(165, 3000));
    display.ride(at(120, 1100));
    expect(display.refresh()).toBe(165);
  });
});
