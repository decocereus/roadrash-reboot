import { availableParallelism, loadavg } from "node:os";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

const BUSY_SHARE = 0.75;
const LOAD_WAIT_MS = 600_000;
const LOAD_POLL_MS = 15_000;

export class LoadTooHigh extends TaggedErrorClass<LoadTooHigh>()(
  "LoadTooHigh",
  { message: Schema.String }
) {}

export interface LoadWatch {
  readonly limit: number;
  readonly pollMs: number;
  readonly read: () => number;
  readonly waitMs: number;
}

const textOf = (load: number): string => load.toFixed(1);

const oneMinuteLoad = (): number => loadavg()[0] ?? 0;

const machineWatch = (): LoadWatch | null =>
  process.env.CI === undefined
    ? {
        limit: availableParallelism() * BUSY_SHARE,
        pollMs: LOAD_POLL_MS,
        read: oneMinuteLoad,
        waitMs: LOAD_WAIT_MS,
      }
    : null;

export const settledLoad = Effect.fnUntraced(function* settledLoad({
  limit,
  pollMs,
  read,
  waitMs,
}: LoadWatch) {
  const startedAt = yield* Clock.currentTimeMillis;
  let announced = false;
  let load = read();
  while (load > limit) {
    if ((yield* Clock.currentTimeMillis) - startedAt >= waitMs) {
      yield* new LoadTooHigh({
        message: `NO VERDICT: load is ${textOf(load)}, over the limit of ${textOf(limit)}, after waiting ${waitMs} ms. Timing rows would fail on load alone, so nothing was measured. Run again when the machine is quiet, or read CI's perf job.`,
      });
    }
    if (!announced) {
      announced = true;
      process.stderr.write(
        `Load is ${textOf(load)}, over the limit of ${textOf(limit)} for a verdict. Waiting for it to fall.\n`
      );
    }
    yield* Effect.sleep(pollMs);
    load = read();
  }
});

export const DRIFTED = "CalibrationUnstable";

export const createLoadGuard = (watch: LoadWatch | null) => {
  let peak = 0;
  return {
    noVerdict: (lines: readonly string[]): string | null => {
      if (watch === null) {
        return null;
      }
      if (peak > watch.limit) {
        return `load reached ${textOf(peak)} during the timed runs, over the limit of ${textOf(watch.limit)}`;
      }
      return lines.some((line) => line.includes(DRIFTED))
        ? "the calibration drifted during a timed run, which usually means something else took the CPU"
        : null;
    },
    note: () => {
      peak = Math.max(peak, watch?.read() ?? 0);
    },
    record: () => (watch === null ? null : { limit: watch.limit, peak }),
  };
};

export const guardedLoad = Effect.fnUntraced(function* guardedLoad(
  timed: boolean
) {
  const watch = timed ? machineWatch() : null;
  if (watch !== null) {
    yield* settledLoad(watch);
  }
  return createLoadGuard(watch);
});
