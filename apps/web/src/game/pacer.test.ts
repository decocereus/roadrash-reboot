import { describe, expect, it } from "vitest";

import { createPacer, createRefreshMeter } from "./pacer.ts";

const PACE = 60;
const STARTING_REFRESH = 60;

const gapsAt = (hertz: number): readonly [number] => [1000 / hertz];

const screen = () => {
  const readRefresh = createRefreshMeter(STARTING_REFRESH);
  const pacer = createPacer();
  let now = 0;
  let refresh = STARTING_REFRESH;
  return {
    drawn(gaps: readonly [number, ...number[]], ms: number): number {
      const end = now + ms;
      let frames = 0;
      for (let index = 0; now < end; index += 1) {
        now += gaps[index % gaps.length] ?? gaps[0];
        refresh = readRefresh(now);
        frames += Number(pacer.due(now, refresh, PACE));
      }
      return frames;
    },
    refresh: () => refresh,
  };
};

describe("the refresh meter", () => {
  it("follows the window up from a 120 Hz screen to a 165 Hz one", () => {
    const display = screen();
    display.drawn(gapsAt(120), 3000);
    expect(display.refresh()).toBe(120);
    display.drawn(gapsAt(165), 3000);
    expect({
      drawn: display.drawn(gapsAt(165), 1000),
      refresh: display.refresh(),
    }).toStrictEqual({ drawn: 55, refresh: 165 });
  });

  it("follows the window down from a 165 Hz screen to a 120 Hz one, and draws 60 a second there", () => {
    const display = screen();
    display.drawn(gapsAt(165), 3000);
    expect(display.refresh()).toBe(165);
    display.drawn(gapsAt(120), 3000);
    expect({
      drawn: display.drawn(gapsAt(120), 1000),
      refresh: display.refresh(),
    }).toStrictEqual({ drawn: 60, refresh: 120 });
  });

  it("waits for two readings before it trusts a lower rate", () => {
    const display = screen();
    display.drawn(gapsAt(165), 3000);
    display.drawn(gapsAt(120), 1100);
    expect(display.refresh()).toBe(165);
  });

  it("keeps a 120 Hz screen whose GPU misses vsyncs, so it draws no extra frames once the GPU catches up", () => {
    const display = screen();
    display.drawn(gapsAt(120), 3000);
    display.drawn([1000 / 120, 1000 / 60], 5000);
    display.drawn(gapsAt(60), 5000);
    expect({
      drawn: display.drawn(gapsAt(120), 1000),
      refresh: display.refresh(),
    }).toStrictEqual({ drawn: 60, refresh: 120 });
  });
});
