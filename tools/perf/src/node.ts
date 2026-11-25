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
import { TaggedError as TaggedErrorClass } from "effect/Schema";

import { MeasurementFailed } from "./measurement-failed.ts";
import { measurementProtocol } from "./protocol.ts";
import { quantile } from "./result.ts";
import {
  benchRun,
  roomParts,
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
export const STEADY_TOLERANCE = measurementProtocol.warmUp.tolerance;
export const MIN_WARM_WINDOWS = measurementProtocol.warmUp.minWindows;
export const MAX_WARM_WINDOWS = measurementProtocol.warmUp.maxWindows;
export const TIMED_WINDOWS = measurementProtocol.timedWindows;

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

type TickClock = () => number;

const prepareWindow = (scenario: Scenario, now: TickClock) => {
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
        const started = now();
        run.step();
        durations[index] = now() - started;
        observeWorkload(run.view, columns, index);
      }
    },
    police,
    racers: run.view.riders.length - police,
    rows: () => rowsOf(columns, WINDOW_TICKS),
  };
};

const windowTiming = Schema.Struct({
  mean: Schema.Number,
  p95: Schema.Number,
  p99: Schema.Number,
});

type WindowTiming = typeof windowTiming.Type;

const timingOfWindow = (durations: readonly number[]): WindowTiming => {
  const sorted = durations.toSorted((left, right) => left - right);
  return {
    mean: sorted.reduce((sum, each) => sum + each, 0) / sorted.length,
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
  };
};

const settled = (warmup: readonly WindowTiming[]): boolean => {
  const latest = warmup.at(-1);
  const fastest = Math.min(...warmup.slice(0, -1).map((each) => each.mean));
  return (
    warmup.length >= MIN_WARM_WINDOWS &&
    latest !== undefined &&
    latest.mean >= (1 - STEADY_TOLERANCE) * fastest
  );
};

class WarmUpUnsettled extends TaggedErrorClass<WarmUpUnsettled>()(
  "WarmUpUnsettled",
  {
    message: Schema.String,
    scenario: Schema.String,
    windows: Schema.Array(windowTiming),
  }
) {}

export const settleWindows = Effect.fnUntraced(function* settleWindows(
  scenario: { readonly id: string },
  timeWindow: () => readonly number[]
) {
  const warmup: WindowTiming[] = [];
  while (warmup.length < MAX_WARM_WINDOWS) {
    warmup.push(timingOfWindow(timeWindow()));
    if (settled(warmup)) {
      return warmup;
    }
  }
  return yield* new WarmUpUnsettled({
    message: `${scenario.id} did not settle in ${MAX_WARM_WINDOWS} warm windows: each of windows ${MIN_WARM_WINDOWS} to ${MAX_WARM_WINDOWS} ran more than ${STEADY_TOLERANCE * 100}% faster than the fastest window before it (${warmup.map((each) => each.mean.toFixed(4)).join(", ")} ms), so it times nothing.`,
    scenario: scenario.id,
    windows: warmup,
  });
});

const measuredWindow = (scenario: Scenario, now: TickClock) => {
  const prepared = prepareWindow(scenario, now);
  prepared.measure();
  return prepared;
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
  scenario: Scenario,
  now: TickClock
) {
  const warmup = yield* settleWindows(scenario, () =>
    measuredWindow(scenario, now).durations()
  );
  const prepared = prepareWindow(scenario, now);
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
    warmup,
  };
});

export const runtimeOf = () => ({
  arch: arch(),
  cpu: cpus()[0]?.model ?? "unknown",
  cpus: cpus().length,
  execArgv: process.execArgv,
  memory: totalmem(),
  node: process.version,
  platform: platform(),
  v8: process.versions.v8,
});

const tasks = [
  "validate",
  "time",
  "alloc",
  "calibrate",
  "snapshot",
  "lobby",
  "roadLife",
  "plazaPack",
  "room",
] as const;

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
  lobby: Schema.optionalKey(
    Schema.Struct({ fewestMoving: Schema.Number, routed: Schema.Number })
  ),
  plazaPack: Schema.optionalKey(
    Schema.Struct({ fewestRiders: Schema.Number, startTick: Schema.Number })
  ),
  police: Schema.optionalKey(Schema.Number),
  racers: Schema.optionalKey(Schema.Number),
  roadLife: Schema.optionalKey(
    Schema.Struct({
      fewestCrossCars: Schema.Number,
      fewestWalkers: Schema.Number,
      mostRacersAtCrossing: Schema.Number,
    })
  ),
  room: Schema.optionalKey(
    Schema.Struct({
      allocated: Schema.Struct({
        client: Schema.Number,
        frame: Schema.Number,
        server: Schema.Number,
      }),
      checkpoint: Schema.Array(Schema.Number),
      checkpointBytes: Schema.Array(Schema.Number),
      confirm: Schema.Array(Schema.Number),
      part: Schema.Literals(roomParts),
      resimulated: Schema.Array(Schema.Number),
      rollback: Schema.Array(Schema.Number),
      seeds: Schema.Array(Schema.Number),
      tick: Schema.Array(Schema.Number),
    })
  ),
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
  snapshot: Schema.optionalKey(
    Schema.Struct({
      bytes: Schema.Array(Schema.Number),
      hash: Schema.Array(Schema.Number),
      restore: Schema.Array(Schema.Number),
      stamp: Schema.Array(Schema.Number),
      write: Schema.Array(Schema.Number),
    })
  ),
  task: Schema.Literals(tasks),
  warmup: Schema.optionalKey(Schema.Array(windowTiming)),
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
  scenario: Scenario,
  now: TickClock
) {
  const base = {
    runtime: runtimeOf(),
    scenario: scenario.id,
    scenarioHash: scenarioHash(scenario),
    task,
  };
  if (task === "calibrate") {
    return { ...base, calibration: calibrationBlock(CALIBRATION_ROUNDS) };
  }
  if (task === "alloc") {
    return { ...base, ...(yield* allocationWindow(scenario, now)) };
  }
  if (task === "time") {
    const warmup = yield* settleWindows(scenario, () =>
      measuredWindow(scenario, now).durations()
    );
    const first = measuredWindow(scenario, now);
    const timed = [
      first,
      ...Array.from({ length: TIMED_WINDOWS - 1 }, () =>
        measuredWindow(scenario, now)
      ),
    ];
    return {
      ...base,
      durations: timed.flatMap((each) => each.durations()),
      police: first.police,
      racers: first.racers,
      rows: first.rows(),
      warmup,
    };
  }
  const prepared = prepareWindow(scenario, now);
  prepared.measure();
  return {
    ...base,
    police: prepared.police,
    racers: prepared.racers,
    rows: prepared.rows(),
  };
});

export const produce = Effect.fnUntraced(function* produce(
  task: ChildRecord["task"],
  scenario: Scenario,
  out: string,
  now: TickClock
) {
  const fs = yield* FileSystem.FileSystem;
  const record = yield* Effect.scoped(measure(task, scenario, now));
  return yield* fs.writeFileString(out, JSON.stringify(record));
});

export const child = Effect.fn("node.child")(function* child(
  args: readonly string[]
) {
  const values = yield* readChildOptions(args);
  const scenario = scenarios.find((each) => each.id === values.scenario);
  const task = taskOf(values.task);
  if (!scenario || Option.isNone(task) || values.out === undefined) {
    return yield* new UsageError({ message: childUsage });
  }
  return yield* produce(task.value, scenario, values.out, () =>
    performance.now()
  );
});
