import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { budgetsFile, judge, metricKinds } from "../src/budgets.ts";
import { snapshotTiming, stampMetric } from "../src/node-lane.ts";
import { scenarios } from "../src/scenarios.ts";

const BASELINES = path.join(import.meta.dirname, "../baselines");

const { limits } = Schema.decodeUnknownSync(Schema.fromJsonString(budgetsFile))(
  readFileSync(path.join(import.meta.dirname, "../budgets.json"), "utf-8")
);

const stampRuns = Schema.Struct({
  runs: Schema.Array(
    Schema.Struct({
      cpu: Schema.String,
      id: Schema.String,
      scenarios: Schema.Array(
        Schema.Struct({
          scale: Schema.Number,
          scenario: Schema.String,
          windows: Schema.Array(Schema.Array(Schema.Number)),
        })
      ),
    })
  ),
});

type StampRun = (typeof stampRuns.Type)["runs"][number];
type Window = readonly number[];

const recorded = (environment: string): readonly StampRun[] =>
  Schema.decodeUnknownSync(Schema.fromJsonString(stampRuns))(
    gunzipSync(
      readFileSync(path.join(BASELINES, `stamp.${environment}.json.gz`))
    ).toString("utf-8")
  ).runs;

const kind = metricKinds.find((each) => each.metric === stampMetric.metric);

const fails = (
  environment: string,
  run: StampRun,
  change: (window: Window, process: number) => Window
): boolean => {
  if (!kind) {
    throw new Error(`${stampMetric.metric} has no metric kind`);
  }
  return run.scenarios.some(({ scale, scenario, windows }) => {
    const known = scenarios.find((each) => each.id === scenario);
    if (!known) {
      throw new Error(`${run.id} records unknown scenario ${scenario}`);
    }
    const observed = snapshotTiming(
      stampMetric,
      known.id,
      environment,
      windows.map(change),
      scale
    );
    const [verdict] = judge(
      limits,
      [observed],
      [{ environment, kind, scenario: known.id }]
    );
    return verdict?.ok !== true;
  });
};

const unchanged = (window: Window): Window => window;

const slower =
  (factor: number) =>
  (window: Window): Window =>
    window.map((each) => each * factor);

const slowestTenthTimes = (factor: number) => (window: Window) => {
  const slowest = new Set(
    window
      .map((value, tick) => ({ tick, value }))
      .toSorted((left, right) => right.value - left.value)
      .slice(0, Math.floor(window.length / 10))
      .map((each) => each.tick)
  );
  return window.map((value, tick) =>
    slowest.has(tick) ? value * factor : value
  );
};

const twoProcessesTimes =
  (factor: number, kept: number) => (window: Window, process: number) =>
    process === kept ? window : slower(factor)(window);

const machines = [
  {
    cpu: "Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 15,
    slowestRunFailsFromPercent: 15,
    twoProcessesFailEveryRunAt: 1.35,
  },
  {
    cpu: "AMD EPYC 7763 64-Core Processor",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 76.9,
    slowestRunFailsFromPercent: 45.6,
    twoProcessesFailEveryRunAt: 1.79,
  },
  {
    cpu: "INTEL(R) XEON(R) PLATINUM 8573C",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 95.4,
    slowestRunFailsFromPercent: 87.3,
    twoProcessesFailEveryRunAt: 1.98,
  },
  {
    cpu: "AMD EPYC 9V74 80-Core Processor",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 112.9,
    slowestRunFailsFromPercent: 51.1,
    twoProcessesFailEveryRunAt: 2.15,
  },
  {
    cpu: "Intel(R) Xeon(R) 6975P-C",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 118.4,
    slowestRunFailsFromPercent: 77.1,
    twoProcessesFailEveryRunAt: 2.25,
  },
  {
    cpu: "AMD EPYC 9V45 96-Core Processor",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 147.9,
    slowestRunFailsFromPercent: 132.8,
    twoProcessesFailEveryRunAt: 2.53,
  },
  {
    cpu: "Apple M4 Pro",
    environment: "node-darwin-arm64",
    everyRunFailsFromPercent: 26.8,
    slowestRunFailsFromPercent: 6.2,
    twoProcessesFailEveryRunAt: 1.3,
  },
] as const;

type Machine = (typeof machines)[number];

const runsOf = (machine: Machine) =>
  recorded(machine.environment).filter((run) => run.cpu === machine.cpu);

describe("timing.stamp.trimmedMean on recorded runs against the committed limits", () => {
  it("holds a recorded run for every machine in the table, and no other machine", () => {
    const cpus = new Set(
      ["node-linux-x64", "node-darwin-arm64"].flatMap((environment) =>
        recorded(environment).map((run) => run.cpu)
      )
    );
    expect([...cpus].toSorted()).toStrictEqual(
      machines.map((machine) => machine.cpu).toSorted()
    );
  });
});

const failing = (
  machine: Machine,
  change: Parameters<typeof fails>[2]
): number =>
  runsOf(machine).filter((run) => fails(machine.environment, run, change))
    .length;

const slowerByPercent = (percent: number) => slower(1 + percent / 100);

describe.each(machines)("timing.stamp.trimmedMean on $cpu", (machine) => {
  const recordedRuns = runsOf(machine).length;

  it("passes every clean recorded run", () => {
    expect(recordedRuns).toBeGreaterThan(0);
    expect(failing(machine, unchanged)).toBe(0);
  });

  it("fails every run when the slowest tenth of ticks gets 100 times slower", () => {
    expect(failing(machine, slowestTenthTimes(100))).toBe(recordedRuns);
  });

  it.each([0, 1, 2])(
    "fails every run when every process but process %i slows down",
    (kept) => {
      expect(
        failing(
          machine,
          twoProcessesTimes(machine.twoProcessesFailEveryRunAt, kept)
        )
      ).toBe(recordedRuns);
    }
  );

  it("fails from the README's smallest uniform slowdown and not below it", () => {
    expect(
      failing(
        machine,
        slowerByPercent(machine.slowestRunFailsFromPercent - 0.2)
      )
    ).toBe(0);
    expect(
      failing(machine, slowerByPercent(machine.slowestRunFailsFromPercent))
    ).toBeGreaterThan(0);
    expect(
      failing(machine, slowerByPercent(machine.everyRunFailsFromPercent))
    ).toBe(recordedRuns);
  });
});
