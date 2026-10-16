import type { FrameRate, GovernReason } from "@racer/telemetry/limits";
import { describe, expect, it } from "vitest";

import { createGovernor, HALF_RATE } from "./governor.ts";

const RUNGS = 9;
const FLOOR = RUNGS - 1;
const VSYNC_MS = 1000 / 60;
const SMOOTH: Shown = { busyMs: 4, intervalMs: VSYNC_MS, resized: false };
const GPU_LATE: Shown = { busyMs: 4, intervalMs: 2 * VSYNC_MS, resized: false };
const CPU_LATE: Shown = {
  busyMs: 30,
  intervalMs: 2 * VSYNC_MS,
  resized: false,
};

interface Shown {
  readonly intervalMs: number;
  readonly busyMs: number;
  readonly resized: boolean;
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
}

const ride = (
  seconds: number,
  show: (seen: Seen, at: number) => Shown,
  { startRung = 0, rate = "auto" }: Ride = {}
): Change[] => {
  const governor = createGovernor(RUNGS);
  governor.startAt(startRung);
  governor.setRate(rate);
  const changes: Change[] = [];
  let at = 0;
  while (at < seconds) {
    const frame = show({ pace: governor.pace, rung: governor.rung }, at);
    at += frame.intervalMs / 1000;
    const verdict = governor.judge({
      busyMs: frame.busyMs,
      refresh: 60,
      resized: frame.resized,
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
    return { busyMs: 1, intervalMs, resized: false };
  };
};

const slipping = safariClock(17.7);
const steady = safariClock(VSYNC_MS);
const halfSteady = safariClock(2 * VSYNC_MS);

const steadyFrom = (changes: Change[], rung: number): number =>
  changes.find((change) => change.rung >= rung)?.at ?? Number.POSITIVE_INFINITY;

describe("the quality governor", () => {
  it("backs off a stretch the GPU cannot hold within two seconds", () => {
    const changes = ride(10, ({ rung }) => (rung < 3 ? GPU_LATE : SMOOTH));
    expect(steadyFrom(changes, 3)).toBeLessThan(2.5);
    expect(
      changes.every((change) => change.reason === "late-burst")
    ).toBeTruthy();
  });

  it("leaves quality alone while the window is being resized", () => {
    const dragging = { busyMs: 3, intervalMs: 83, resized: true };
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
});
