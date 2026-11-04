import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";

import { createLoadGuard, settledLoad } from "../src/load.ts";
import type { LoadWatch } from "../src/load.ts";

const watchOf = (loads: readonly number[], waitMs: number) => {
  let reads = 0;
  const watch: LoadWatch = {
    limit: 9,
    pollMs: 1,
    read: () => {
      const load = loads[Math.min(reads, loads.length - 1)] ?? 0;
      reads += 1;
      return load;
    },
    waitMs,
  };
  return { reads: () => reads, watch };
};

describe(settledLoad, () => {
  it("goes straight on when the machine is quiet", async () => {
    const { reads, watch } = watchOf([3], 1000);
    await Effect.runPromise(settledLoad(watch));
    expect(reads()).toBe(1);
  });

  it("waits for a busy machine to fall to the limit", async () => {
    const { reads, watch } = watchOf([17, 12, 9], 1000);
    await Effect.runPromise(settledLoad(watch));
    expect(reads()).toBe(3);
  });

  it("refuses with no verdict when the load stays over the limit", async () => {
    const { watch } = watchOf([17], 3);
    const exit = await Effect.runPromiseExit(settledLoad(watch));
    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(String(exit)).toContain(
      "NO VERDICT: load is 17.0, over the limit of 9.0"
    );
  });
});

describe(createLoadGuard, () => {
  const drifted = ["FAIL node reference-v1 pair=4 CalibrationUnstable"];
  const clean = [
    "FAIL node reference-v1 sim.tick.p95 observed=9 ms limit <= 8 ms",
  ];

  it("keeps a quiet run's rows as its verdict", () => {
    const guard = createLoadGuard(watchOf([3], 0).watch);
    guard.note();
    expect(guard.noVerdict(clean)).toBeNull();
    expect(guard.record()).toStrictEqual({ limit: 9, peak: 3 });
  });

  it("gives no verdict when a reading peaks over the limit", () => {
    const guard = createLoadGuard(watchOf([3, 17, 3], 0).watch);
    guard.note();
    guard.note();
    guard.note();
    expect(guard.noVerdict(clean)).toContain("load reached 17.0");
  });

  it("gives no verdict when the calibration drifted under a quiet reading", () => {
    const guard = createLoadGuard(watchOf([7], 0).watch);
    guard.note();
    expect(guard.noVerdict(drifted)).toContain("calibration drifted");
  });

  it("leaves CI's rows as its verdict, because its runner does nothing else", () => {
    const guard = createLoadGuard(null);
    guard.note();
    expect(guard.noVerdict(drifted)).toBeNull();
    expect(guard.record()).toBeNull();
  });
});
