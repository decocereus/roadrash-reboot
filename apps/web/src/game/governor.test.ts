import type { GovernReason } from "@racer/telemetry/limits";
import { describe, expect, it } from "vitest";

import { createGovernor } from "./governor.ts";

const RUNGS = 9;
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

interface Change {
  readonly at: number;
  readonly reason: GovernReason;
  readonly rung: number;
}

const ride = (
  seconds: number,
  show: (rung: number, at: number) => Shown,
  startRung = 0
): Change[] => {
  const governor = createGovernor(RUNGS);
  governor.startAt(startRung);
  const changes: Change[] = [];
  let at = 0;
  while (at < seconds) {
    const frame = show(governor.rung, at);
    at += frame.intervalMs / 1000;
    const verdict = governor.judge({
      busyMs: frame.busyMs,
      refresh: 60,
      resized: frame.resized,
      seconds: frame.intervalMs / 1000,
    });
    if (verdict) {
      governor.commit(verdict);
      changes.push({ at, reason: verdict.reason, rung: governor.rung });
    }
  }
  return changes;
};

const steadyFrom = (changes: Change[], rung: number): number =>
  changes.find((change) => change.rung >= rung)?.at ?? Number.POSITIVE_INFINITY;

describe("the quality governor", () => {
  it("backs off a stretch the GPU cannot hold within two seconds", () => {
    const changes = ride(10, (rung) => (rung < 3 ? GPU_LATE : SMOOTH));
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
    const changes = ride(30 * 60, (rung) => (rung === 0 ? GPU_LATE : SMOOTH));
    const backToFull = changes.filter((change) => change.rung === 0);
    expect(backToFull).toHaveLength(1);
    const [retry] = backToFull;
    const [firstDrop] = changes;
    expect(retry?.reason).toBe("calm-retry");
    expect((retry?.at ?? 0) - (firstDrop?.at ?? 0)).toBeGreaterThanOrEqual(300);
  });
});
