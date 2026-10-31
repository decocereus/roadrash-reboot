import { requiredRows } from "../src/budgets.ts";
import type { Budgets, Limit } from "../src/budgets.ts";
import { glbNames } from "../src/build.ts";
import type { BuildRecord } from "../src/build.ts";
import { evaluateBaseline } from "../src/evaluate.ts";
import type { Samples } from "../src/evaluate.ts";
import type { NodeLane, NodeSample } from "../src/node-lane.ts";
import { CALIBRATION_ROUNDS } from "../src/node.ts";
import type { ChildRecord } from "../src/node.ts";
import { scenarioHash, scenarios, WINDOW_TICKS } from "../src/scenarios.ts";
import type { Scenario, WorkloadRows } from "../src/scenarios.ts";

const runtime = {
  arch: "x",
  cpu: "synthetic",
  cpus: 1,
  execArgv: [],
  memory: 1,
  node: "v0",
  platform: "test",
  v8: "0",
};

const CHECKSUM = 1;
const CALIBRATION_MS = 8;
const CALIBRATION_SAMPLES = 31;
const TICK_MS = 0.3;
const SPREAD_STEP = 37;
const SPREAD_SPAN = 101;
export const ALLOCATED_PER_TICK = 1_000_000;
const TIMING_PAIRS = 5;
const ALLOCATION_PAIRS = 3;
const SNAPSHOT_RUNS = 3;
const SNAPSHOT_WRITE_MS = 0.05;
const SNAPSHOT_RESTORE_MS = 0.04;
const SNAPSHOT_HASH_MS = 0.08;
const SNAPSHOT_BYTES = 12_000;
const CLOSURE_BYTES = 100_000;

export const validRows = (scenario: Scenario): WorkloadRows => {
  const { band, window } = scenario;
  const step = band.max - band.min;
  let extra = band.total - band.min * WINDOW_TICKS;
  const ahead = Array.from({ length: WINDOW_TICKS }, () => {
    const added = Math.min(step, extra);
    extra -= added;
    return band.min + added;
  });
  return {
    ahead,
    modes: ahead.map(() => "riding"),
    speeds: ahead.map(() => scenario.minSpeed),
    ticks: ahead.map((_, index) => window.from + index),
  };
};

const pairs = (count: number): number[] =>
  Array.from({ length: count }, (_, pair) => pair);

export interface Slowdown {
  readonly runner: number;
  readonly sim: number;
}

const tickDurations = (factor: number): number[] =>
  Array.from(
    { length: WINDOW_TICKS },
    (_, index) =>
      TICK_MS *
      factor *
      (1 + ((index * SPREAD_STEP) % SPREAD_SPAN) / SPREAD_SPAN)
  );

const sampleOf = (
  scenario: Scenario,
  side: NodeSample["side"],
  task: ChildRecord["task"],
  file: string,
  measured: Partial<ChildRecord>
): NodeSample => ({
  file,
  record: {
    ...measured,
    runtime,
    scenario: scenario.id,
    scenarioHash: scenarioHash(scenario),
    task,
  },
  side,
  startedAt: 0,
});

export const syntheticLane = (
  scenario: Scenario,
  slowdown: Slowdown,
  rowsB: WorkloadRows = validRows(scenario)
): NodeLane => {
  const rows = validRows(scenario);
  const workload = { police: scenario.police, racers: scenario.racers };
  const timed = (side: NodeSample["side"], pair: number) =>
    sampleOf(scenario, side, "time", `time-${pair}-${side}.json`, {
      ...workload,
      durations: tickDurations(
        slowdown.runner * (side === "B" ? slowdown.sim : 1)
      ),
      rows: side === "B" ? rowsB : rows,
    });
  const allocated = (side: NodeSample["side"], pair: number) =>
    sampleOf(scenario, side, "alloc", `alloc-${pair}-${side}.json`, {
      ...workload,
      allocation: {
        bytes: ALLOCATED_PER_TICK * WINDOW_TICKS,
        samplingInterval: 4096,
        tree: {},
      },
      rows: side === "B" ? rowsB : rows,
    });
  const snapshotted = (run: number) =>
    sampleOf(scenario, "B", "snapshot", `snapshot-${run}-B.json`, {
      ...workload,
      rows: rowsB,
      snapshot: {
        bytes: Array.from({ length: WINDOW_TICKS }, () => SNAPSHOT_BYTES),
        hash: tickDurations(SNAPSHOT_HASH_MS * slowdown.runner),
        restore: tickDurations(SNAPSHOT_RESTORE_MS * slowdown.runner),
        write: tickDurations(SNAPSHOT_WRITE_MS * slowdown.runner),
      },
    });
  return {
    allocation: pairs(ALLOCATION_PAIRS).map((pair) => ({
      a: allocated("A", pair),
      b: allocated("B", pair),
      order: pair % 2 === 0 ? ["A", "B"] : ["B", "A"],
      pair,
    })),
    calibrations: pairs(TIMING_PAIRS + 1).map((index) =>
      sampleOf(scenario, "B", "calibrate", `calibrate-${index}.json`, {
        calibration: {
          checksums: [CHECKSUM],
          durations: Array.from(
            { length: CALIBRATION_SAMPLES },
            () => CALIBRATION_MS * slowdown.runner
          ),
          rounds: CALIBRATION_ROUNDS,
        },
      })
    ),
    scenario: scenario.id,
    snapshots: pairs(SNAPSHOT_RUNS).map(snapshotted),
    timing: pairs(TIMING_PAIRS).map((pair) => ({
      a: timed("A", pair),
      b: timed("B", pair),
      order: pair % 2 === 0 ? ["A", "B"] : ["B", "A"],
      pair,
    })),
    validation: [
      sampleOf(scenario, "A", "validate", "validate-A.json", {
        ...workload,
        rows,
      }),
      sampleOf(scenario, "B", "validate", "validate-B.json", {
        ...workload,
        rows: rowsB,
      }),
    ],
  };
};

const closure = (raw: number) => ({ files: [], gzip: raw / 4, raw });

export const syntheticBuild = (
  side: BuildRecord["side"],
  bikeBytes: number
): BuildRecord => ({
  artifactDigest: side,
  closures: {
    client: closure(CLOSURE_BYTES * 4),
    game: closure(CLOSURE_BYTES * 2),
    gameIncremental: closure(CLOSURE_BYTES),
    kit: closure(CLOSURE_BYTES),
    root: closure(CLOSURE_BYTES),
    uploaderIncremental: closure(CLOSURE_BYTES / 10),
    worker: closure(CLOSURE_BYTES),
  },
  durationMs: 0,
  glb: glbNames.map((name) => ({
    emitted: `assets/${name}.glb`,
    emittedSha256: name,
    name,
    raw: name === "bike" ? bikeBytes : CLOSURE_BYTES,
    sha256: name,
    textureBytes: 0,
  })),
  payloads: [],
  problems: [],
  side,
});

const identity = {
  dirty: false,
  harnessDigest: "harness",
  revision: "synthetic",
  sourceDigest: "source",
  sourceFiles: 1,
};

export const samplesOf = (
  comparisonId: string,
  node: readonly NodeLane[],
  build: { readonly A: BuildRecord; readonly B: BuildRecord }
): Samples => ({
  build,
  comparisonId,
  lanes: ["node", "build"],
  mode: "gate",
  node,
  sides: { A: identity, B: identity },
  version: 1,
});

export const BIKE_BYTES = 122_108;

export const steadyLanes = (slowdown: Slowdown): NodeLane[] =>
  scenarios.map((scenario) => syntheticLane(scenario, slowdown));

const unusedGpuLimits = (): Limit[] =>
  requiredRows(["gpu"], []).map(({ environment, kind, scenario }) => ({
    baseline: 0,
    derivation: "synthetic",
    direction: kind.direction,
    environment,
    metric: kind.metric,
    paired: kind.paired,
    scenario,
    source: "synthetic",
    unit: kind.unit,
    value: 0,
  }));

export const syntheticBudgets = (build: {
  readonly A: BuildRecord;
  readonly B: BuildRecord;
}): Budgets => {
  const { proposal } = evaluateBaseline({
    ...samplesOf("baseline", steadyLanes({ runner: 1, sim: 1 }), build),
    mode: "baseline",
  });
  return {
    baseline: {
      raw: [],
      revision: "synthetic",
      summary: "summary.json",
      summarySha256: "0",
    },
    limits: [...proposal.limits, ...unusedGpuLimits()],
    nodeProfiles: proposal.nodeProfiles,
    version: 1,
  };
};
