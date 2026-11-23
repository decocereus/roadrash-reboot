import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vitest";

import {
  childRecord,
  MAX_WARM_WINDOWS,
  produce,
  settleWindows,
  STEADY_TOLERANCE,
  TIMED_WINDOWS,
} from "../src/node.ts";
import type { ChildRecord } from "../src/node.ts";
import { scenarios, WINDOW_TICKS } from "../src/scenarios.ts";
import type { Scenario } from "../src/scenarios.ts";

const PRODUCER_TIMEOUT_MS = 60_000;
const SLOW_THEN_STEADY = [2, 1, 1] as const;

const decodeRecord = Schema.decodeUnknownSync(
  Schema.fromJsonString(childRecord)
);

const made: string[] = [];

const recordPath = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-perf-steady-"));
  made.push(dir);
  return path.join(dir, "record.json");
};

const referenceScenario = (): Scenario => {
  const [reference] = scenarios;
  if (!reference) {
    throw new Error("The registry lost a scenario.");
  }
  return reference;
};

const clockReadsPerWindow = 2 * WINDOW_TICKS;

const windowClock = (tickMs: (window: number) => number) => {
  let reads = 0;
  let now = 0;
  return () => {
    now += tickMs(Math.floor(reads / clockReadsPerWindow));
    reads += 1;
    return now;
  };
};

const slowThenSteadyClock = () =>
  windowClock(
    (window) => SLOW_THEN_STEADY[window] ?? SLOW_THEN_STEADY.at(-1) ?? 1
  );

const neverAgreeingClock = () =>
  windowClock((window) => (window % 2 === 0 ? 1 : 1 + STEADY_TOLERANCE * 3));

const produced = async (
  task: ChildRecord["task"],
  scenario: Scenario,
  now: () => number
) => {
  const out = recordPath();
  const outcome = await Effect.runPromise(
    produce(task, scenario, out, now).pipe(
      Effect.provide(NodeFileSystem.layer),
      Effect.as("wrote a record" as const),
      Effect.catchTag("WarmUpUnsettled", (unsettled) =>
        Effect.succeed(unsettled)
      )
    )
  );
  return { out, outcome };
};

const writtenRecord = (out: string) => decodeRecord(readFileSync(out, "utf-8"));

const expectPinnedTicks = (scenario: Scenario, record: ChildRecord) => {
  const ticks = record.rows?.ticks;
  expect(ticks).toHaveLength(WINDOW_TICKS);
  expect(ticks?.at(0)).toBe(scenario.window.from);
  expect(ticks?.at(-1)).toBe(scenario.window.to);
};

describe("the node child producer", () => {
  afterEach(() => {
    for (const dir of made.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it(
    "times four windows of the pinned ticks after the warm-up settles",
    async () => {
      const reference = referenceScenario();
      const { outcome, out } = await produced(
        "time",
        reference,
        slowThenSteadyClock()
      );
      expect(outcome).toBe("wrote a record");
      const record = writtenRecord(out);
      expect(record.warmup?.map((each) => each.mean)).toStrictEqual([
        ...SLOW_THEN_STEADY,
      ]);
      expect(record.durations).toHaveLength(WINDOW_TICKS * TIMED_WINDOWS);
      expect(record.durations).toHaveLength(2404);
      expect(new Set(record.durations)).toStrictEqual(
        new Set([SLOW_THEN_STEADY.at(-1)])
      );
      expectPinnedTicks(reference, record);
    },
    PRODUCER_TIMEOUT_MS
  );

  it(
    "samples allocation on the pinned ticks after the warm-up settles",
    async () => {
      const reference = referenceScenario();
      const { outcome, out } = await produced(
        "alloc",
        reference,
        slowThenSteadyClock()
      );
      expect(outcome).toBe("wrote a record");
      const record = writtenRecord(out);
      expect(record.warmup?.map((each) => each.mean)).toStrictEqual([
        ...SLOW_THEN_STEADY,
      ]);
      expect(record.allocation?.bytes).toBeGreaterThan(0);
      expectPinnedTicks(reference, record);
    },
    PRODUCER_TIMEOUT_MS
  );

  it.each(["time", "alloc"] as const)(
    "%s: a child that never settles fails with WarmUpUnsettled and writes no record",
    async (task) => {
      const early = {
        ...referenceScenario(),
        window: { from: 1, to: WINDOW_TICKS },
      };
      const { outcome, out } = await produced(
        task,
        early,
        neverAgreeingClock()
      );
      expect(existsSync(out)).toBeFalsy();
      expect(outcome).toMatchObject({
        _tag: "WarmUpUnsettled",
        scenario: "reference-v1",
      });
      expect(outcome === "wrote a record" ? [] : outcome.windows).toHaveLength(
        MAX_WARM_WINDOWS
      );
    },
    PRODUCER_TIMEOUT_MS
  );
});

describe(settleWindows, () => {
  it("stops at the first two windows whose means agree", async () => {
    const within = 1 + STEADY_TOLERANCE / 2;
    const means = [3, 1.6, within, 1];
    let timed = 0;
    const warmup = await Effect.runPromise(
      settleWindows({ id: "synthetic-v1" }, () => {
        timed += 1;
        return [means[timed - 1] ?? Number.NaN];
      })
    );
    expect(warmup.map((each) => each.mean)).toStrictEqual(means);
    expect(timed).toBe(4);
  });
});
