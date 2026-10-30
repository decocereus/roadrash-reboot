import path from "node:path";

import { ToolProcesses } from "@racer/devtools/process";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import type { NodeProfile, Observation } from "./budgets.ts";
import { MeasurementFailed } from "./measurement-failed.ts";
import {
  CALIBRATION_ROUNDS,
  CALIBRATION_VERSION,
  childRecord,
} from "./node.ts";
import type { ChildRecord } from "./node.ts";
import { median, quantile } from "./result.ts";
import { validateWorkload, WINDOW_TICKS } from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";
import type { Side, SideName } from "./sides.ts";

const TIMING_PAIRS = 5;
const ALLOCATION_PAIRS = 3;
const SNAPSHOT_RUNS = 3;

const decodeChild = Schema.decodeUnknownEffect(
  Schema.fromJsonString(childRecord)
);

const sideName = Schema.Literals(["A", "B"]);

const nodeSample = Schema.Struct({
  file: Schema.String,
  record: childRecord,
  side: sideName,
  startedAt: Schema.Number,
});

export type NodeSample = typeof nodeSample.Type;

const nodePair = Schema.Struct({
  a: nodeSample,
  b: nodeSample,
  order: Schema.Array(sideName),
  pair: Schema.Number,
});

type NodePair = typeof nodePair.Type;

export const nodeLaneRecord = Schema.Struct({
  allocation: Schema.Array(nodePair),
  calibrations: Schema.Array(nodeSample),
  scenario: Schema.String,
  snapshots: Schema.Array(nodeSample),
  timing: Schema.Array(nodePair),
  validation: Schema.Array(nodeSample),
});

export type NodeLane = typeof nodeLaneRecord.Type;

export interface Sides {
  readonly A: Side;
  readonly B: Side;
}

const runChild = Effect.fnUntraced(function* runChild(
  side: Side,
  task: ChildRecord["task"],
  scenario: Scenario,
  dir: string,
  label: string
) {
  const fs = yield* FileSystem.FileSystem;
  const processes = yield* ToolProcesses;
  const file = path.join(dir, `${scenario.id}-${label}.json`);
  const startedAt = yield* Clock.currentTimeMillis;
  const script =
    task === "snapshot" ? "tools/perf/snapshot.ts" : "tools/perf/node.ts";
  const taskArgs = task === "snapshot" ? [] : ["--task", task];
  yield* processes.run(
    process.execPath,
    [
      path.join(side.root, script),
      ...taskArgs,
      "--scenario",
      scenario.id,
      "--out",
      file,
    ],
    { cwd: side.root }
  );
  const record = yield* fs.readFileString(file).pipe(
    Effect.flatMap(decodeChild),
    Effect.mapError(
      (cause) =>
        new MeasurementFailed({
          cause,
          lane: "node",
          message: `The ${task} child for ${scenario.id} on side ${side.name} wrote no readable record.`,
        })
    )
  );
  const sample: NodeSample = {
    file: path.basename(file),
    record,
    side: side.name,
    startedAt,
  };
  return sample;
});

const orderOf = (pair: number): readonly SideName[] =>
  pair % 2 === 0 ? ["A", "B"] : ["B", "A"];

const pairOf = Effect.fnUntraced(function* pairOf(
  sides: Sides,
  task: "time" | "alloc",
  scenario: Scenario,
  dir: string,
  pair: number
) {
  const order = orderOf(pair);
  const samples: NodeSample[] = [];
  for (const name of order) {
    samples.push(
      yield* runChild(
        sides[name],
        task,
        scenario,
        dir,
        `${task}-${pair}-${name}`
      )
    );
  }
  const a = samples.find((sample) => sample.side === "A");
  const b = samples.find((sample) => sample.side === "B");
  if (!(a && b)) {
    return yield* new MeasurementFailed({
      lane: "node",
      message: `Pair ${pair} of ${scenario.id} lost a side.`,
    });
  }
  const measured: NodePair = { a, b, order, pair };
  return measured;
});

export const nodeLane = Effect.fn("node.lane")(function* nodeLane(
  scenario: Scenario,
  sides: Sides,
  dir: string
) {
  const validation = [
    yield* runChild(sides.A, "validate", scenario, dir, "validate-A"),
    yield* runChild(sides.B, "validate", scenario, dir, "validate-B"),
  ];
  const calibrate = (index: number) =>
    runChild(sides.B, "calibrate", scenario, dir, `calibrate-${index}`);
  const calibrations = [yield* calibrate(0)];
  const timing: NodePair[] = [];
  for (let pair = 0; pair < TIMING_PAIRS; pair += 1) {
    timing.push(yield* pairOf(sides, "time", scenario, dir, pair));
    calibrations.push(yield* calibrate(pair + 1));
  }
  const allocation: NodePair[] = [];
  for (let pair = 0; pair < ALLOCATION_PAIRS; pair += 1) {
    allocation.push(yield* pairOf(sides, "alloc", scenario, dir, pair));
  }
  const snapshots: NodeSample[] = [];
  for (let run = 0; run < SNAPSHOT_RUNS; run += 1) {
    snapshots.push(
      yield* runChild(sides.B, "snapshot", scenario, dir, `snapshot-${run}-B`)
    );
  }
  const lane: NodeLane = {
    allocation,
    calibrations,
    scenario: scenario.id,
    snapshots,
    timing,
    validation,
  };
  return lane;
});

export const nodeEnvironment = (record: ChildRecord): string =>
  `node-${record.runtime.platform}-${record.runtime.arch}`;

const samplesOf = (lane: NodeLane): NodeSample[] => [
  ...lane.validation,
  ...lane.timing.flatMap((pair) => [pair.a, pair.b]),
  ...lane.allocation.flatMap((pair) => [pair.a, pair.b]),
  ...lane.snapshots,
];

const workloadFailures = (
  scenario: Scenario,
  lane: NodeLane,
  expectedHash: string
): string[] =>
  samplesOf(lane).flatMap((sample) => {
    const { record } = sample;
    const where = `FAIL workload ${scenario.id} side=${sample.side} ${sample.file}`;
    if (record.scenarioHash !== expectedHash) {
      return [
        `${where} scenario=${record.scenarioHash.slice(0, 12)} expected=${expectedHash.slice(0, 12)}`,
      ];
    }
    if (
      record.racers !== scenario.racers ||
      record.police !== scenario.police
    ) {
      return [
        `${where} racers=${record.racers ?? "missing"} police=${record.police ?? "missing"} expected=${scenario.racers}/${scenario.police}`,
      ];
    }
    if (!record.rows) {
      return [`${where} wrote no workload rows`];
    }
    const problem = validateWorkload(scenario, record.rows);
    return problem
      ? [
          `${where} tick=${problem.tick} ${problem.field}=${problem.actual} expected=${problem.expected}`,
        ]
      : [];
  });

const calibrationFailures = (
  scenario: Scenario,
  lane: NodeLane,
  environment: string,
  profile: NodeProfile | undefined
): string[] => {
  if (!profile) {
    return [
      `FAIL node ${scenario.id} runner ${environment} has no calibration profile`,
    ];
  }
  const { calibration } = profile;
  if (
    calibration.version !== CALIBRATION_VERSION ||
    calibration.rounds !== CALIBRATION_ROUNDS
  ) {
    return [
      `FAIL node ${scenario.id} calibration v${calibration.version}x${calibration.rounds} does not match the harness v${CALIBRATION_VERSION}x${CALIBRATION_ROUNDS}`,
    ];
  }
  return lane.calibrations.flatMap((sample) => {
    const checksums = sample.record.calibration?.checksums ?? [];
    return checksums.length === 1 && checksums[0] === calibration.checksum
      ? []
      : [
          `FAIL node ${scenario.id} ${sample.file} calibration checksum ${checksums.join(",")} expected ${calibration.checksum}`,
        ];
  });
};

const mean = (values: readonly number[]): number =>
  values.reduce((sum, each) => sum + each, 0) / values.length;

interface RunTiming {
  readonly ticksPerSecond: number;
  readonly p95: number;
  readonly p99: number;
}

const timingOf = (record: ChildRecord): RunTiming => {
  const durations = record.durations ?? [];
  const sorted = durations.toSorted((left, right) => left - right);
  return {
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    ticksPerSecond:
      durations.length === WINDOW_TICKS ? 1000 / mean(durations) : Number.NaN,
  };
};

const allocatedPerTick = (record: ChildRecord): number =>
  (record.allocation?.bytes ?? Number.NaN) / WINDOW_TICKS;

type SnapshotRun = NonNullable<ChildRecord["snapshot"]>;

const snapshotMetrics = [
  { metric: "snapshot.write.p95", of: (run: SnapshotRun) => run.write },
  { metric: "snapshot.restore.p95", of: (run: SnapshotRun) => run.restore },
  { metric: "snapshot.hash.p95", of: (run: SnapshotRun) => run.hash },
] as const;

const p95Of = (durations: readonly number[]): number =>
  quantile(
    durations.toSorted((left, right) => left - right),
    0.95
  );

const snapshotRuns = (lane: NodeLane): readonly SnapshotRun[] =>
  lane.snapshots.flatMap((sample) =>
    sample.record.snapshot ? [sample.record.snapshot] : []
  );

const snapshotObservations = (
  scenario: Scenario,
  lane: NodeLane,
  environment: string,
  scale: number
): readonly Observation[] => {
  const runs = snapshotRuns(lane);
  const bytes = runs.map((run) => Math.max(...run.bytes));
  return [
    ...snapshotMetrics.map(({ metric, of }): Observation => {
      const measured = runs.map((run) => p95Of(of(run)) / scale);
      return {
        environment,
        lane: "node",
        metric,
        note: `runs=${measured.length} scale=${scale.toFixed(3)}`,
        paired: null,
        runs: { a: [], b: measured },
        scenario: scenario.id,
        value: median(measured),
      };
    }),
    {
      environment,
      lane: "node",
      metric: "snapshot.bytes.max",
      note: `runs=${bytes.length}`,
      paired: null,
      runs: { a: [], b: bytes },
      scenario: scenario.id,
      value: median(bytes),
    },
  ];
};

export const nodeVerdicts = (
  scenario: Scenario,
  lane: NodeLane,
  expectedHash: string,
  profiles: Readonly<Record<string, NodeProfile>>
) => {
  const [first] = lane.calibrations;
  const environment = first ? nodeEnvironment(first.record) : "node-unknown";
  const profile = profiles[environment];
  const failures = [
    ...workloadFailures(scenario, lane, expectedHash),
    ...calibrationFailures(scenario, lane, environment, profile),
  ];
  if (failures.length > 0 || !profile) {
    return { environment, failures, observations: [], scales: [] };
  }
  const { calibration } = profile;
  const medians = lane.calibrations.map((sample) =>
    median(sample.record.calibration?.durations ?? [])
  );
  const scales = lane.timing.map((pair) => {
    const before = medians[pair.pair] ?? Number.NaN;
    const after = medians[pair.pair + 1] ?? Number.NaN;
    return {
      after,
      before,
      drift: Math.abs(after - before) / Math.min(after, before),
      pair: pair.pair,
      scale: (before + after) / 2 / calibration.median,
    };
  });
  for (const each of scales) {
    if (!(each.drift <= calibration.maxDrift)) {
      failures.push(
        `FAIL node ${scenario.id} pair=${each.pair} CalibrationUnstable before=${each.before.toFixed(3)} ms after=${each.after.toFixed(3)} ms drift=${each.drift.toFixed(3)} limit ${calibration.maxDrift}`
      );
    }
    if (
      !(
        each.scale >= calibration.minScale && each.scale <= calibration.maxScale
      )
    ) {
      failures.push(
        `FAIL node ${scenario.id} pair=${each.pair} RunnerUnsupported scale=${each.scale.toFixed(3)} outside ${calibration.minScale}..${calibration.maxScale}`
      );
    }
  }
  if (failures.length > 0) {
    return { environment, failures, observations: [], scales };
  }
  const runs = lane.timing.map((pair, index) => ({
    a: timingOf(pair.a.record),
    b: timingOf(pair.b.record),
    scale: scales[index]?.scale ?? Number.NaN,
  }));
  const timed = (
    metric: string,
    pick: (run: RunTiming) => number,
    normalize: (value: number, scale: number) => number
  ): Observation => {
    const raw = median(runs.map((run) => pick(run.b)));
    const scale = median(runs.map((run) => run.scale));
    const normalized = {
      a: runs.map((run) => normalize(pick(run.a), run.scale)),
      b: runs.map((run) => normalize(pick(run.b), run.scale)),
    };
    return {
      environment,
      lane: "node",
      metric,
      note: `raw=${raw.toPrecision(5)} scale=${scale.toFixed(3)}`,
      paired: median(runs.map((run) => pick(run.b) / pick(run.a))),
      runs: normalized,
      scenario: scenario.id,
      value: median(normalized.b),
    };
  };
  const allocated = {
    a: lane.allocation.map((pair) => allocatedPerTick(pair.a.record)),
    b: lane.allocation.map((pair) => allocatedPerTick(pair.b.record)),
  };
  const laneScale = median(runs.map((run) => run.scale));
  const observations: Observation[] = [
    timed(
      "sim.ticksPerSecond",
      (run) => run.ticksPerSecond,
      (value, scale) => value * scale
    ),
    timed(
      "sim.tick.p95",
      (run) => run.p95,
      (value, scale) => value / scale
    ),
    timed(
      "sim.tick.p99",
      (run) => run.p99,
      (value, scale) => value / scale
    ),
    {
      environment,
      lane: "node",
      metric: "sim.allocatedBytesPerTick",
      note: "uncalibrated",
      paired: median(
        allocated.b.map((value, index) => value / (allocated.a[index] ?? 0))
      ),
      runs: allocated,
      scenario: scenario.id,
      value: median(allocated.b),
    },
    ...snapshotObservations(scenario, lane, environment, laneScale),
  ];
  return { environment, failures, observations, scales };
};
