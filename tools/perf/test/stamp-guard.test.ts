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
    cpu: "AMD EPYC 7763 64-Core Processor",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 39.5,
    slowestRunFailsFromPercent: 20.4,
    twoProcessesFailEveryRunAt: 1.43,
  },
  {
    cpu: "INTEL(R) XEON(R) PLATINUM 8573C",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 52.4,
    slowestRunFailsFromPercent: 48.3,
    twoProcessesFailEveryRunAt: 1.57,
  },
  {
    cpu: "AMD EPYC 9V74 80-Core Processor",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 62,
    slowestRunFailsFromPercent: 36.4,
    twoProcessesFailEveryRunAt: 1.63,
  },
  {
    cpu: "Intel(R) Xeon(R) 6975P-C",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 70.7,
    slowestRunFailsFromPercent: 64.3,
    twoProcessesFailEveryRunAt: 1.73,
  },
  {
    cpu: "AMD EPYC 9V45 96-Core Processor",
    environment: "node-linux-x64",
    everyRunFailsFromPercent: 100.6,
    slowestRunFailsFromPercent: 92.5,
    twoProcessesFailEveryRunAt: 2.09,
  },
  {
    cpu: "Apple M4 Pro",
    environment: "node-darwin-arm64",
    everyRunFailsFromPercent: 15.7,
    slowestRunFailsFromPercent: 4.8,
    twoProcessesFailEveryRunAt: 1.2,
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
