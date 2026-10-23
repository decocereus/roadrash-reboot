import { setImmediate as nextTurn } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import type { Compiling } from "../src/game/post.ts";
import { createPreparation } from "../src/game/preparation.ts";
import type { Clock, PrepareOutcome } from "../src/game/preparation.ts";

interface ManualClock extends Clock {
  readonly advance: (ms: number) => void;
  readonly pending: () => number;
}

interface Timer {
  readonly at: number;
  readonly run: () => void;
}

const manualClock = (): ManualClock => {
  const timers = new Map<number, Timer>();
  let now = 0;
  let next = 0;
  return {
    advance: (ms) => {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.run();
        }
      }
    },
    after: (ms, run) => {
      const id = next;
      next += 1;
      timers.set(id, { at: now + ms, run });
      return () => {
        timers.delete(id);
      };
    },
    pending: () => timers.size,
  };
};

interface Job {
  readonly finish: () => void;
  stopped: boolean;
}

interface Options {
  readonly compileThrows?: boolean;
  readonly warmThrows?: boolean;
}

const harness = ({
  compileThrows = false,
  warmThrows = false,
}: Options = {}) => {
  const clock = manualClock();
  const jobs: Job[] = [];
  const counts = { compiles: 0, warms: 0 };
  const preparation = createPreparation({
    clock,
    compile: (): Compiling => {
      counts.compiles += 1;
      if (compileThrows) {
        throw new Error("The shader would not compile.");
      }
      const { promise, resolve } = Promise.withResolvers<null>();
      const job: Job = {
        finish: () => {
          resolve(null);
        },
        stopped: false,
      };
      jobs.push(job);
      return {
        ready: promise,
        stop: () => {
          job.stopped = true;
          resolve(null);
        },
      };
    },
    warm: () => {
      counts.warms += 1;
      if (warmThrows) {
        throw new Error("The warm-up draw failed.");
      }
    },
  });
  return { clock, counts, jobs, preparation };
};

const record = async (
  outcome: Promise<PrepareOutcome>,
  seen: PrepareOutcome[]
): Promise<void> => {
  seen.push(await outcome);
};

const settledOf = (outcome: Promise<PrepareOutcome>) => {
  const seen: PrepareOutcome[] = [];
  void record(outcome, seen);
  return seen;
};

describe("shader preparation outcomes", () => {
  it("warms once, stops polling and leaves no timer when the programs are ready", async () => {
    const { clock, counts, jobs, preparation } = harness();
    const outcome = preparation.prepare();
    jobs[0]?.finish();
    await expect(outcome).resolves.toStrictEqual({ kind: "ready" });
    expect({
      pending: clock.pending(),
      stopped: jobs[0]?.stopped,
      warms: counts.warms,
    }).toStrictEqual({ pending: 0, stopped: true, warms: 1 });
  });

  it("times out at five seconds, warms anyway and ignores a late ready", async () => {
    const { clock, counts, jobs, preparation } = harness();
    const outcome = preparation.prepare();
    const seen = settledOf(outcome);
    clock.advance(4999);
    await nextTurn();
    expect(seen).toStrictEqual([]);
    clock.advance(1);
    await expect(outcome).resolves.toStrictEqual({ kind: "timedOut" });
    jobs[0]?.finish();
    await nextTurn();
    expect({
      pending: clock.pending(),
      stopped: jobs[0]?.stopped,
      warms: counts.warms,
    }).toStrictEqual({ pending: 0, stopped: true, warms: 1 });
  });

  it("reports a compile throw as a failed outcome with its cause, after the same warm-up", async () => {
    const { clock, counts, preparation } = harness({ compileThrows: true });
    const outcome = await preparation.prepare();
    expect(outcome).toMatchObject({ kind: "failed", stage: "compile" });
    expect(outcome).toHaveProperty(
      ["cause", "message"],
      "The shader would not compile."
    );
    expect({ pending: clock.pending(), warms: counts.warms }).toStrictEqual({
      pending: 0,
      warms: 1,
    });
  });

  it("reports a warm-up throw as a failed outcome instead of an unhandled rejection", async () => {
    const { clock, jobs, preparation } = harness({ warmThrows: true });
    const outcome = preparation.prepare();
    jobs[0]?.finish();
    await expect(outcome).resolves.toMatchObject({
      kind: "failed",
      stage: "warm",
    });
    expect(clock.pending()).toBe(0);
  });

  it("cancels the job it replaces without warming it, and the replacement still finishes", async () => {
    const { clock, counts, jobs, preparation } = harness();
    const first = preparation.prepare();
    const second = preparation.prepare();
    await expect(first).resolves.toStrictEqual({ kind: "cancelled" });
    expect({
      pending: clock.pending(),
      stopped: jobs[0]?.stopped,
    }).toStrictEqual({ pending: 1, stopped: true });
    jobs[1]?.finish();
    await expect(second).resolves.toStrictEqual({ kind: "ready" });
    jobs[0]?.finish();
    clock.advance(10_000);
    await nextTurn();
    expect({ pending: clock.pending(), warms: counts.warms }).toStrictEqual({
      pending: 0,
      warms: 1,
    });
  });

  it("ends a pending job as lost on context loss, compiles nothing while lost and resumes after restore", async () => {
    const { clock, counts, jobs, preparation } = harness();
    const pending = preparation.prepare();
    preparation.lose();
    await expect(pending).resolves.toStrictEqual({ kind: "lost" });
    await expect(preparation.prepare()).resolves.toStrictEqual({
      kind: "lost",
    });
    preparation.warmNow();
    expect({
      compiles: counts.compiles,
      pending: clock.pending(),
      stopped: jobs[0]?.stopped,
      warms: counts.warms,
    }).toStrictEqual({ compiles: 1, pending: 0, stopped: true, warms: 0 });
    preparation.restore();
    const restored = preparation.prepare();
    jobs[1]?.finish();
    await expect(restored).resolves.toStrictEqual({ kind: "ready" });
  });

  it("cancels on unmount and nothing runs after the deadline or a late ready", async () => {
    const { clock, counts, jobs, preparation } = harness();
    const pending = preparation.prepare();
    preparation.cancel();
    await expect(pending).resolves.toStrictEqual({ kind: "cancelled" });
    clock.advance(6000);
    jobs[0]?.finish();
    await nextTurn();
    expect({ pending: clock.pending(), warms: counts.warms }).toStrictEqual({
      pending: 0,
      warms: 0,
    });
  });

  it("warms at once and cancels a pending job when a race starts before preparation ends", async () => {
    const { clock, counts, preparation } = harness();
    const pending = preparation.prepare();
    preparation.warmNow();
    await expect(pending).resolves.toStrictEqual({ kind: "cancelled" });
    expect({ pending: clock.pending(), warms: counts.warms }).toStrictEqual({
      pending: 0,
      warms: 1,
    });
  });
});
