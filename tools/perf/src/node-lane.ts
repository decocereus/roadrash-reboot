import { createHash } from "node:crypto";
import path from "node:path";

import { ToolProcesses } from "@racer/devtools/process";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import type { NodeProfile, Observation } from "./budgets.ts";
import { DRIFTED } from "./load.ts";
import { MeasurementFailed } from "./measurement-failed.ts";
import { roomCoverageFailures, roomObservations } from "./node-lane-room.ts";
import type { RoomRun } from "./node-lane-room.ts";
import {
  CALIBRATION_ROUNDS,
  CALIBRATION_VERSION,
  childRecord,
  TIMED_WINDOWS,
} from "./node.ts";
import type { ChildRecord } from "./node.ts";
import { measurementProtocol } from "./protocol.ts";
import { median, p95Of, quantile } from "./result.ts";
import { validateWorkload, WINDOW_TICKS } from "./scenarios.ts";
import type { RoomPart, Scenario } from "./scenarios.ts";
import type { Side, SideName } from "./sides.ts";

const TIMING_PAIRS = measurementProtocol.pairs.timing;
const ALLOCATION_PAIRS = measurementProtocol.pairs.allocation;

const decodeChild = Schema.decodeUnknownEffect(
  Schema.fromJsonString(childRecord)
);

const sideName = Schema.Literals(["A", "B"]);

export const nodeSample = Schema.Struct({
  file: Schema.String,
  record: childRecord,
  side: sideName,
  startedAt: Schema.Number,
});

export type NodeSample = typeof nodeSample.Type;

const snapshotSample = Schema.Struct({
  ...nodeSample.fields,
  record: Schema.Struct({
    ...childRecord.fields,
    snapshot: childRecord.fields.snapshot.schema,
  }),
});

export type SnapshotSample = typeof snapshotSample.Type;

const roomSample = Schema.Struct({
  ...nodeSample.fields,
  record: Schema.Struct({
    ...childRecord.fields,
    room: childRecord.fields.room.schema,
  }),
});

export type RoomSample = typeof roomSample.Type;

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
  rooms: Schema.Tuple([roomSample, roomSample, roomSample]),
  scenario: Schema.String,
  snapshots: Schema.Tuple([snapshotSample, snapshotSample, snapshotSample]),
  timing: Schema.Array(nodePair),
  validation: Schema.Array(nodeSample),
});

export type NodeLane = typeof nodeLaneRecord.Type;

export interface Sides {
  readonly A: Side;
  readonly B: Side;
}

const NODE_CHILD = "tools/perf/node.ts";
const LAYOUT_BYTES = measurementProtocol.layoutPaddingBytes;

export const layoutPadding = (childFile: string): string =>
  "x".repeat(
    createHash("sha256").update(childFile).digest().readUInt32BE(0) %
      LAYOUT_BYTES
  );

const childScripts = {
  alloc: NODE_CHILD,
  calibrate: NODE_CHILD,
  lobby: "tools/perf/lobby.ts",
  roadLife: "tools/perf/road-life.ts",
  room: "tools/perf/room.ts",
  snapshot: "tools/perf/snapshot.ts",
  time: NODE_CHILD,
  validate: NODE_CHILD,
} as const satisfies Readonly<Record<ChildRecord["task"], string>>;

export const runChild = Effect.fnUntraced(function* runChild(
  side: Side,
  task: ChildRecord["task"],
  scenario: { readonly id: string },
  dir: string,
  label: string,
  childArgs: readonly string[] = []
) {
  const fs = yield* FileSystem.FileSystem;
  const processes = yield* ToolProcesses;
  const file = path.join(dir, `${scenario.id}-${label}.json`);
  const startedAt = yield* Clock.currentTimeMillis;
  const script = childScripts[task];
  const taskArgs = script === NODE_CHILD ? ["--task", task] : [];
  yield* processes.run(
    process.execPath,
    [
      ...measurementProtocol.nodeFlags,
      path.join(side.root, script),
      ...taskArgs,
      ...childArgs,
      "--scenario",
      scenario.id,
      "--out",
      file,
    ],
    {
      cwd: side.root,
      env: {
        ...process.env,
        PERF_LAYOUT_PADDING: layoutPadding(path.basename(file)),
      },
    }
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

const missingPayload = (sample: NodeSample, payload: string) =>
  new MeasurementFailed({
    lane: "node",
    message: `${sample.file} wrote no ${payload} timings.`,
  });

const snapshotRun = Effect.fnUntraced(function* snapshotRun(
  sides: Sides,
  scenario: Scenario,
  dir: string,
  run: number
) {
  const sample = yield* runChild(
    sides.B,
    "snapshot",
    scenario,
    dir,
    `snapshot-${run}-B`
  );
  const { snapshot } = sample.record;
  if (!snapshot) {
    return yield* missingPayload(sample, "snapshot");
  }
  const measured: SnapshotSample = {
    ...sample,
    record: { ...sample.record, snapshot },
  };
  return measured;
});

const roomRun = Effect.fnUntraced(function* roomRun(
  sides: Sides,
  scenario: Scenario,
  dir: string,
  part: RoomPart
) {
  const sample = yield* runChild(
    sides.B,
    "room",
    scenario,
    dir,
    `room-${part}-B`,
    ["--part", String(part)]
  );
  const { room } = sample.record;
  if (!room) {
    return yield* missingPayload(sample, "room");
  }
  const measured: RoomSample = {
    ...sample,
    record: { ...sample.record, room },
  };
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
  const snapshots = [
    yield* snapshotRun(sides, scenario, dir, 0),
    yield* snapshotRun(sides, scenario, dir, 1),
    yield* snapshotRun(sides, scenario, dir, 2),
  ] as const;
  const rooms = [
    yield* roomRun(sides, scenario, dir, 0),
    yield* roomRun(sides, scenario, dir, 1),
    yield* roomRun(sides, scenario, dir, 2),
  ] as const;
  const lane: NodeLane = {
    allocation,
    calibrations,
    rooms,
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
    if (
      (record.task === "time" || record.task === "alloc") &&
      (record.warmup?.length ?? 0) < 2
    ) {
      return [`${where} wrote no settled warm-up windows`];
    }
    const problem = validateWorkload(scenario, record.rows);
    return problem
      ? [
          `${where} tick=${problem.tick} ${problem.field}=${problem.actual} expected=${problem.expected}`,
        ]
      : [];
  });

export const calibrationFailures = (
  scenario: { readonly id: string },
  lane: { readonly calibrations: readonly NodeSample[] },
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

export const scalesAcross = (
  scenario: { readonly id: string },
  calibrations: readonly NodeSample[],
  count: number,
  calibration: NodeProfile["calibration"]
) => {
  const medians = calibrations.map((sample) =>
    median(sample.record.calibration?.durations ?? [])
  );
  const scales = Array.from({ length: count }, (_, pair) => {
    const before = medians[pair] ?? Number.NaN;
    const after = medians[pair + 1] ?? Number.NaN;
    return {
      after,
      before,
      drift: Math.abs(after - before) / Math.min(after, before),
      pair,
      scale: (before + after) / 2 / calibration.median,
    };
  });
  const failures = scales.flatMap((each) => [
    ...(each.drift <= calibration.maxDrift
      ? []
      : [
          `FAIL node ${scenario.id} pair=${each.pair} ${DRIFTED} before=${each.before.toFixed(3)} ms after=${each.after.toFixed(3)} ms drift=${each.drift.toFixed(3)} limit ${calibration.maxDrift}`,
        ]),
    ...(each.scale >= calibration.minScale && each.scale <= calibration.maxScale
      ? []
      : [
          `FAIL node ${scenario.id} pair=${each.pair} RunnerUnsupported scale=${each.scale.toFixed(3)} outside ${calibration.minScale}..${calibration.maxScale}`,
        ]),
  ]);
  return { failures, scales };
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
    p95: quantile(sorted, measurementProtocol.shares.p95),
    p99: quantile(sorted, measurementProtocol.shares.p99),
    ticksPerSecond:
      durations.length === WINDOW_TICKS * TIMED_WINDOWS
        ? 1000 / mean(durations)
        : Number.NaN,
  };
};

const allocatedPerTick = (record: ChildRecord): number =>
  (record.allocation?.bytes ?? Number.NaN) / WINDOW_TICKS;

type SnapshotRun = NonNullable<ChildRecord["snapshot"]>;

const STAMP_TRIM = measurementProtocol.shares.stampTrim;

const trimmedMeanOf = (durations: readonly number[]): number => {
  const sorted = durations.toSorted((left, right) => left - right);
  return mean(
    sorted.slice(0, sorted.length - Math.floor(sorted.length * STAMP_TRIM))
  );
};

const stampMetric = {
  metric: "timing.stamp.trimmedMean",
  of: (run: SnapshotRun) => run.stamp,
  per: trimmedMeanOf,
  perRun: "mean without the slowest 5%",
} as const;

const snapshotMetrics = [
  {
    metric: "snapshot.write.p95",
    of: (run: SnapshotRun) => run.write,
    per: p95Of,
    perRun: "p95",
  },
  {
    metric: "snapshot.restore.p95",
    of: (run: SnapshotRun) => run.restore,
    per: p95Of,
    perRun: "p95",
  },
  {
    metric: "snapshot.hash.p95",
    of: (run: SnapshotRun) => run.hash,
    per: p95Of,
    perRun: "p95",
  },
  stampMetric,
] as const;

type SnapshotMetric = (typeof snapshotMetrics)[number];

const snapshotTiming = (
  { metric, per, perRun }: SnapshotMetric,
  scenario: string,
  environment: string,
  windows: readonly (readonly number[])[],
  scale: number
): Observation => {
  const measured = windows.map((window) => per(window) / scale);
  return {
    environment,
    lane: "node",
    metric,
    note: `runs=${measured.length} median of each run's ${perRun} scale=${scale.toFixed(3)}`,
    paired: null,
    runs: { a: [], b: measured },
    scenario,
    value: median(measured),
  };
};

const snapshotRuns = (lane: NodeLane): readonly SnapshotRun[] =>
  lane.snapshots.map((sample) => sample.record.snapshot);

const snapshotObservations = (
  scenario: Scenario,
  lane: NodeLane,
  environment: string,
  scale: number
): readonly Observation[] => {
  const runs = snapshotRuns(lane);
  const bytes = runs.map((run) => Math.max(...run.bytes));
  return [
    ...snapshotMetrics.map((spec) =>
      snapshotTiming(spec, scenario.id, environment, runs.map(spec.of), scale)
    ),
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

const roomRuns = (lane: NodeLane): readonly RoomRun[] =>
  lane.rooms.map((sample) => sample.record.room);

export const coldLine = (
  scenario: Scenario,
  lane: NodeLane,
  scales: readonly number[]
): string => {
  const side = (pick: (pair: NodePair) => NodeSample) => {
    const cold = lane.timing.map(
      (pair, index) =>
        (pick(pair).record.warmup?.[0]?.p99 ?? Number.NaN) /
        (scales[index] ?? Number.NaN)
    );
    const windows = lane.timing.map(
      (pair) => pick(pair).record.warmup?.length ?? 0
    );
    return { cold: median(cold), windows: windows.join(",") };
  };
  const a = side((pair) => pair.a);
  const b = side((pair) => pair.b);
  return `info node ${scenario.id} cold.tick.p99 A=${a.cold.toPrecision(4)} ms B=${b.cold.toPrecision(4)} ms, the first window of a fresh process, calibrated, no budget; warm windows A=${a.windows} B=${b.windows}`;
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
    ...roomCoverageFailures(scenario, roomRuns(lane)),
    ...calibrationFailures(scenario, lane, environment, profile),
  ];
  if (failures.length > 0 || !profile) {
    return { environment, failures, observations: [], scales: [] };
  }
  const { failures: unstable, scales } = scalesAcross(
    scenario,
    lane.calibrations,
    lane.timing.length,
    profile.calibration
  );
  if (unstable.length > 0) {
    return { environment, failures: unstable, observations: [], scales };
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
    ...roomObservations(scenario, roomRuns(lane), environment, laneScale),
  ];
  return { environment, failures, observations, scales };
};
