import type { HeapProfiler } from "node:inspector";
import { Session } from "node:inspector/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import { observeWorkload, workloadColumns } from "@racer/sim/bench-workload";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { MeasurementFailed } from "./measurement-failed.ts";
import {
  benchRun,
  rowsOf,
  scenarioHash,
  scenarios,
  WINDOW_TICKS,
  workloadRows,
} from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";

export const CALIBRATION_VERSION = 1;
const CALIBRATION_SAMPLES = 31;
const CALIBRATION_WORDS = 65_536;
const CALIBRATION_STRIDE = 7;
const MODULUS = 4_294_967_296;
const MULTIPLIER = 1_664_525;
const INCREMENT = 1_013_904_223;
const CALIBRATION_WARMUP = 5;
export const CALIBRATION_ROUNDS = 10;
const ALLOCATION_SAMPLING_BYTES = 4096;

const calibrationData = new Uint32Array(CALIBRATION_WORDS);

const calibrationPass = (rounds: number): number => {
  let state = 1;
  for (let index = 0; index < CALIBRATION_WORDS; index += 1) {
    calibrationData[index] = Math.imul(state, MULTIPLIER) + INCREMENT;
    state = calibrationData[index] ?? 0;
  }
  let sum = 0;
  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < CALIBRATION_WORDS; index += 1) {
      const other =
        calibrationData[
          (index * CALIBRATION_STRIDE + round) % CALIBRATION_WORDS
        ] ?? 0;
      calibrationData[index] =
        Math.imul((calibrationData[index] ?? 0) + other, MULTIPLIER) +
        INCREMENT;
      sum = (sum + (calibrationData[index] ?? 0)) % MODULUS;
    }
  }
  return sum;
};

const calibrationBlock = (rounds: number) => {
  for (let warm = 0; warm < CALIBRATION_WARMUP; warm += 1) {
    calibrationPass(rounds);
  }
  const durations: number[] = [];
  const checksums = new Set<number>();
  for (let sample = 0; sample < CALIBRATION_SAMPLES; sample += 1) {
    const started = performance.now();
    checksums.add(calibrationPass(rounds));
    durations.push(performance.now() - started);
  }
  return { checksums: [...checksums], durations, rounds };
};

const prepareWindow = (scenario: Scenario) => {
  const run = benchRun(scenario.bench);
  const police = run.view.riders.filter(
    (rider) => rider.profile.role === "police"
  ).length;
  while (run.view.tick < scenario.window.from - 1) {
    run.step();
  }
  const columns = workloadColumns(WINDOW_TICKS);
  const durations = new Float64Array(WINDOW_TICKS);
  return {
    durations: () => [...durations],
    measure: () => {
      for (let index = 0; index < WINDOW_TICKS; index += 1) {
        const started = performance.now();
        run.step();
        durations[index] = performance.now() - started;
        observeWorkload(run.view, columns, index);
      }
    },
    police,
    racers: run.view.riders.length - police,
    rows: () => rowsOf(columns, WINDOW_TICKS),
  };
};

const warmWindow = (scenario: Scenario) => {
  prepareWindow(scenario).measure();
  return prepareWindow(scenario);
};

const sampledBytes = (node: HeapProfiler.SamplingHeapProfileNode): number =>
  node.children.reduce(
    (total, child) => total + sampledBytes(child),
    node.selfSize
  );

const inspector = (method: string) => (cause: unknown) =>
  new MeasurementFailed({
    cause,
    lane: "node",
    message: `The inspector refused ${method}.`,
  });

const allocationWindow = Effect.fnUntraced(function* allocationWindow(
  scenario: Scenario
) {
  const prepared = warmWindow(scenario);
  const session = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const opened = new Session();
      opened.connect();
      return opened;
    }),
    (opened) =>
      Effect.sync(() => {
        opened.disconnect();
      })
  );
  yield* Effect.tryPromise({
    catch: inspector("HeapProfiler.enable"),
    try: async () => {
      await session.post("HeapProfiler.enable");
    },
  });
  yield* Effect.tryPromise({
    catch: inspector("HeapProfiler.startSampling"),
    try: async () => {
      await session.post("HeapProfiler.startSampling", {
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
        samplingInterval: ALLOCATION_SAMPLING_BYTES,
      });
    },
  });
  yield* Effect.sync(prepared.measure);
  const { profile } = yield* Effect.tryPromise({
    catch: inspector("HeapProfiler.stopSampling"),
    try: async () => await session.post("HeapProfiler.stopSampling"),
  });
  return {
    allocation: {
      bytes: sampledBytes(profile.head),
      samplingInterval: ALLOCATION_SAMPLING_BYTES,
      tree: profile.head,
    },
    police: prepared.police,
    racers: prepared.racers,
    rows: prepared.rows(),
  };
});

const runtime = () => ({
  arch: arch(),
  cpu: cpus()[0]?.model ?? "unknown",
  cpus: cpus().length,
  execArgv: process.execArgv,
  memory: totalmem(),
  node: process.version,
  platform: platform(),
  v8: process.versions.v8,
});

const tasks = ["validate", "time", "alloc", "calibrate"] as const;

export const childRecord = Schema.Struct({
  allocation: Schema.optionalKey(
    Schema.Struct({
      bytes: Schema.Number,
      samplingInterval: Schema.Number,
      tree: Schema.Unknown,
    })
  ),
  calibration: Schema.optionalKey(
    Schema.Struct({
      checksums: Schema.Array(Schema.Number),
      durations: Schema.Array(Schema.Number),
      rounds: Schema.Number,
    })
  ),
  durations: Schema.optionalKey(Schema.Array(Schema.Number)),
  police: Schema.optionalKey(Schema.Number),
  racers: Schema.optionalKey(Schema.Number),
  rows: Schema.optionalKey(workloadRows),
  runtime: Schema.Struct({
    arch: Schema.String,
    cpu: Schema.String,
    cpus: Schema.Number,
    execArgv: Schema.Array(Schema.String),
    memory: Schema.Number,
    node: Schema.String,
    platform: Schema.String,
    v8: Schema.String,
  }),
  scenario: Schema.String,
  scenarioHash: Schema.String,
  task: Schema.Literals(tasks),
});

export type ChildRecord = typeof childRecord.Type;

const childUsage =
  "Usage: node tools/perf/node.ts --task validate|time|alloc|calibrate --scenario <id> --out <file>";

const readChildOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) =>
      new UsageError({ message: `${String(cause)}\n${childUsage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: {
          out: { type: "string" },
          scenario: { type: "string" },
          task: { type: "string" },
        },
      }).values,
  });

const taskOf = Schema.decodeUnknownOption(Schema.Literals(tasks));

const measure = Effect.fnUntraced(function* measure(
  task: ChildRecord["task"],
  scenario: Scenario
) {
  const base = {
    runtime: runtime(),
    scenario: scenario.id,
    scenarioHash: scenarioHash(scenario),
    task,
  };
  if (task === "calibrate") {
    return { ...base, calibration: calibrationBlock(CALIBRATION_ROUNDS) };
  }
  if (task === "alloc") {
    return { ...base, ...(yield* allocationWindow(scenario)) };
  }
  const prepared =
    task === "time" ? warmWindow(scenario) : prepareWindow(scenario);
  prepared.measure();
  const measured = {
    ...base,
    police: prepared.police,
    racers: prepared.racers,
    rows: prepared.rows(),
  };
  return task === "time"
    ? { ...measured, durations: prepared.durations() }
    : measured;
});

export const child = Effect.fn("node.child")(function* child(
  args: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const values = yield* readChildOptions(args);
  const scenario = scenarios.find((each) => each.id === values.scenario);
  const task = taskOf(values.task);
  if (!scenario || Option.isNone(task) || values.out === undefined) {
    return yield* new UsageError({ message: childUsage });
  }
  const record = yield* Effect.scoped(measure(task.value, scenario));
  return yield* fs.writeFileString(values.out, JSON.stringify(record));
});
