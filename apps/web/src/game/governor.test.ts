import type { FrameRate, GovernReason } from "@racer/telemetry/limits";
import { describe, expect, it } from "vitest";

import { createGovernor, HALF_RATE } from "./governor.ts";
import type { Governor } from "./governor.ts";
import { createPacer, createRefreshMeter } from "./pacer.ts";

const RUNGS = 9;
const FLOOR = RUNGS - 1;
const VSYNC_MS = 1000 / 60;
const SMOOTH: Shown = { busyMs: 4, excused: false, intervalMs: VSYNC_MS };
const GPU_LATE: Shown = {
  busyMs: 4,
  excused: false,
  intervalMs: 2 * VSYNC_MS,
};
const CPU_LATE: Shown = {
  busyMs: 30,
  excused: false,
  intervalMs: 2 * VSYNC_MS,
};

interface Shown {
  readonly intervalMs: number;
  readonly busyMs: number;
  readonly excused: boolean;
}

interface Seen {
  readonly rung: number;
  readonly pace: number;
}

interface Change extends Seen {
  readonly at: number;
  readonly reason: GovernReason;
}

interface Ride {
  readonly startRung?: number;
  readonly rate?: FrameRate;
  readonly refresh?: number;
}

const ride = (
  seconds: number,
  show: (seen: Seen, at: number) => Shown,
  { startRung, rate, refresh = 60 }: Ride = {},
  governor: Governor = createGovernor(RUNGS)
): Change[] => {
  if (startRung !== undefined) {
    governor.startAt(startRung);
  }
  if (rate !== undefined) {
    governor.setRate(rate);
  }
  const changes: Change[] = [];
  let at = 0;
  while (at < seconds) {
    const frame = show({ pace: governor.pace, rung: governor.rung }, at);
    at += frame.intervalMs / 1000;
    const verdict = governor.judge({
      busyMs: frame.busyMs,
      excused: frame.excused,
      refresh,
      seconds: frame.intervalMs / 1000,
    });
    if (verdict) {
      governor.commit(verdict);
      changes.push({
        at,
        pace: governor.pace,
        reason: verdict.reason,
        rung: governor.rung,
      });
    }
  }
  return changes;
};

const safariClock = (meanMs: number) => {
  let clock = 0;
  return (): Shown => {
    const next = clock + meanMs;
    const intervalMs = Math.floor(next) - Math.floor(clock);
    clock = next;
    return { busyMs: 1, excused: false, intervalMs };
  };
};

const slipping = safariClock(17.7);
const steady = safariClock(VSYNC_MS);
const halfSteady = safariClock(2 * VSYNC_MS);

const paced = (refresh: number, pace: number) => {
  const pacer = createPacer();
  const vsync = 1000 / refresh;
  let tick = 0;
  let drawn = 0;
  return (): Shown => {
    for (;;) {
      tick += 1;
      const now = tick * vsync + (tick % 3) * 0.3;
      if (pacer.due(now, refresh, pace)) {
        const intervalMs = now - drawn;
        drawn = now;
        return { busyMs: 1, excused: false, intervalMs };
      }
    }
  };
};

const steadyFrom = (changes: Change[], rung: number): number =>
  changes.find((change) => change.rung >= rung)?.at ?? Number.POSITIVE_INFINITY;

describe("the quality governor", () => {
  it("backs off a stretch the GPU cannot hold within two seconds", () => {
    const changes = ride(10, ({ rung }) => (rung < 3 ? GPU_LATE : SMOOTH));
    expect(steadyFrom(changes, 3)).toBeLessThan(2.5);
    expect(
      changes.some((change) => change.reason === "late-burst")
    ).toBeTruthy();
  });

  it("leaves quality alone while the window is being resized", () => {
    const dragging = { busyMs: 3, excused: true, intervalMs: 83 };
    expect(ride(5, () => dragging)).toStrictEqual([]);
  });

  it("does not drop the picture fast when the main thread is the slow part", () => {
    const changes = ride(6, () => CPU_LATE);
    expect(changes.length).toBeLessThanOrEqual(2);
    expect(
      changes.every((change) => change.reason === "late-budget")
    ).toBeTruthy();
  });

  it("retries a rung that failed once after five calm minutes, and never after a second failure", () => {
    const changes = ride(30 * 60, ({ rung }) =>
      rung === 0 ? GPU_LATE : SMOOTH
    );
    const backToFull = changes.filter((change) => change.rung === 0);
    expect(backToFull).toHaveLength(1);
    const [retry] = backToFull;
    const [firstDrop] = changes;
    expect(retry?.reason).toBe("calm-retry");
    expect((retry?.at ?? 0) - (firstDrop?.at ?? 0)).toBeGreaterThanOrEqual(300);
  });

  it("sees Safari slipping to 56 fps although no single frame looks late", () => {
    const changes = ride(10, ({ rung }) => (rung < 4 ? slipping() : steady()), {
      startRung: 3,
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reason).toBe("under-rate");
    expect(changes[0]?.at).toBeLessThan(5);
  });

  it("never touches a steady 60, even with a dropped frame now and then", () => {
    let frame = 0;
    const changes = ride(10 * 60, () => {
      frame += 1;
      return frame % 240 === 0 ? GPU_LATE : steady();
    });
    expect(changes).toStrictEqual([]);
  });

  it("holds a steady 30 when even the lowest detail cannot keep up", () => {
    const changes = ride(
      60,
      ({ pace }) => (pace === HALF_RATE ? halfSteady() : slipping()),
      { startRung: 3 }
    );
    const lock = changes.find((change) => change.reason === "steady-30");
    expect(lock?.rung).toBe(FLOOR);
    expect(lock?.pace).toBe(HALF_RATE);
    expect(changes.at(-1)).toStrictEqual(lock);
    expect(lock?.at).toBeLessThan(30);
  });

  it("never locks to 30 when the player picked 60, and always holds 30 when they picked 30", () => {
    const sixty = ride(60, () => slipping(), { rate: "60" });
    expect(sixty.some((change) => change.pace === HALF_RATE)).toBeFalsy();
    expect(sixty.at(-1)?.rung).toBe(FLOOR);
    const thirty = ride(60, () => halfSteady(), { rate: "30" });
    expect(thirty).toStrictEqual([]);
  });

  it("holds an even 30 on 75 and 144 Hz screens without mistaking it for slipping", () => {
    for (const [refresh, gapMs] of [
      [75, 40],
      [144, 5000 / 144],
    ] as const) {
      const show = paced(refresh, HALF_RATE);
      const gaps = Array.from({ length: 50 }, () => show().intervalMs).slice(1);
      expect(gaps.every((gap) => Math.abs(gap - gapMs) < 1)).toBeTruthy();
      expect(ride(60, show, { rate: "30", refresh })).toStrictEqual([]);
    }
  });

  it("forgets a hidden tab instead of counting the gap as slipping", () => {
    const governor = createGovernor(RUNGS);
    const judge = (shown: Shown) =>
      governor.judge({
        busyMs: shown.busyMs,
        excused: shown.excused,
        refresh: 60,
        seconds: shown.intervalMs / 1000,
      });
    const verdicts = [];
    for (let at = 0; at < 2.05; at += 0.0177) {
      verdicts.push(judge(slipping()));
    }
    governor.interrupt();
    verdicts.push(judge({ busyMs: 1, excused: true, intervalMs: 100 }));
    for (let at = 0; at < 10; at += VSYNC_MS / 1000) {
      verdicts.push(judge(steady()));
    }
    expect(verdicts.filter((verdict) => verdict !== null)).toStrictEqual([]);
  });

  it("keeps its failure memory when the window moves to another screen", () => {
    const governor = createGovernor(RUNGS);
    ride(
      40,
      ({ pace }) => (pace === HALF_RATE ? halfSteady() : slipping()),
      { startRung: 3 },
      governor
    );
    expect(governor.pace).toBe(HALF_RATE);
    governor.resize(6);
    const afterMove = ride(
      60,
      ({ pace }) => (pace === HALF_RATE ? halfSteady() : steady()),
      {},
      governor
    );
    expect(afterMove).toStrictEqual([]);
  });

  it("reads a jittery 120 Hz screen as 120, not 144", () => {
    const meter = createRefreshMeter();
    const readings: number[] = [];
    for (let tick = 0; tick < 600; tick += 1) {
      const jitter = ((tick * 7) % 5) - 2;
      const reading = meter.tick((tick * 1000) / 120 + jitter * 0.7);
      if (reading !== null) {
        readings.push(reading);
      }
    }
    expect(readings.length).toBeGreaterThan(3);
    expect(readings.every((rate) => rate === 120)).toBeTruthy();
  });

  it("does not rush the next frame after the browser skips a callback", () => {
    const pacer = createPacer();
    const vsync = 1000 / 120;
    const gaps: number[] = [];
    let drawn = 0;
    for (let tick = 1; tick < 200; tick += 1) {
      const now = tick * vsync;
      if (tick !== 101 && pacer.due(now, 120, HALF_RATE)) {
        gaps.push(now - drawn);
        drawn = now;
      }
    }
    const shortest = Math.min(...gaps.slice(1));
    expect(shortest).toBeGreaterThan(4 * vsync - 1);
  });
});
