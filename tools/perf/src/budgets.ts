import * as Schema from "effect/Schema";

import { glbNames } from "./build.ts";
import { scenarios } from "./scenarios.ts";

export type Lane = "node" | "build" | "gpu";

export const GPU_ENVIRONMENT = "gpu-helium-metal";

export interface MetricKind {
  readonly metric: string;
  readonly lane: Lane;
  readonly unit: string;
  readonly direction: "min" | "max";
  readonly paired: number | null;
  readonly perScenario: boolean;
}

const nodeKind = (
  metric: string,
  unit: string,
  direction: "min" | "max",
  paired: number
): MetricKind => ({
  direction,
  lane: "node",
  metric,
  paired,
  perScenario: true,
  unit,
});

const nodeKinds: readonly MetricKind[] = [
  nodeKind("sim.ticksPerSecond", "ticks/s", "min", 0.9),
  nodeKind("sim.tick.p95", "ms", "max", 1.15),
  nodeKind("sim.tick.p99", "ms", "max", 1.2),
  nodeKind("sim.allocatedBytesPerTick", "B", "max", 1.1),
];

const byteClosures = [
  "route.root",
  "route.kit",
  "game",
  "game.incremental",
  "worker",
  "client",
];

const buildKinds: readonly MetricKind[] = [
  ...byteClosures.flatMap((closure) =>
    ["raw", "gzip"].map((encoding) => `bytes.${closure}.${encoding}`)
  ),
  ...glbNames.map((name) => `assets.glb.${name}`),
  "assets.glb.total",
  "assets.texture.total",
].map((metric) => ({
  direction: "max",
  lane: "build",
  metric,
  paired: null,
  perScenario: false,
  unit: "B",
}));

const gpuKind = (
  metric: string,
  unit: string,
  paired: number | null
): MetricKind => ({
  direction: "max",
  lane: "gpu",
  metric,
  paired,
  perScenario: true,
  unit,
});

const gpuKinds: readonly MetricKind[] = [
  gpuKind("frame.interval.p50", "ms", 1.1),
  gpuKind("frame.interval.p95", "ms", 1.15),
  gpuKind("frame.interval.p99", "ms", 1.2),
  gpuKind("frame.missedFraction", "share", null),
  gpuKind("riders.cpu.p95", "ms", null),
  gpuKind("main.longTask.count", "tasks", null),
  gpuKind("main.longTask.blockingMs", "ms", null),
  gpuKind("render.calls.max", "calls", null),
  gpuKind("render.triangles.max", "triangles", null),
  gpuKind("render.programs.max", "programs", null),
  gpuKind("render.textures.max", "textures", null),
];

export const metricKinds: readonly MetricKind[] = [
  ...nodeKinds,
  ...buildKinds,
  ...gpuKinds,
];

const nodeProfile = Schema.Struct({
  arch: Schema.String,
  calibration: Schema.Struct({
    checksum: Schema.Number,
    maxDrift: Schema.Number,
    maxScale: Schema.Number,
    median: Schema.Number,
    minScale: Schema.Number,
    rounds: Schema.Number,
    version: Schema.Number,
  }),
  platform: Schema.String,
  source: Schema.String,
});

export type NodeProfile = typeof nodeProfile.Type;

const limitRow = Schema.Struct({
  baseline: Schema.Number,
  derivation: Schema.String,
  direction: Schema.Literals(["min", "max"]),
  environment: Schema.String,
  metric: Schema.String,
  paired: Schema.NullOr(Schema.Number),
  scenario: Schema.NullOr(Schema.String),
  source: Schema.String,
  unit: Schema.String,
  value: Schema.Number,
});

export type Limit = typeof limitRow.Type;

export const budgetsFile = Schema.Struct({
  baseline: Schema.Struct({
    raw: Schema.Array(
      Schema.Struct({ file: Schema.String, sha256: Schema.String })
    ),
    revision: Schema.String,
    summary: Schema.String,
    summarySha256: Schema.String,
  }),
  limits: Schema.Array(limitRow),
  nodeProfiles: Schema.Record(Schema.String, nodeProfile),
  version: Schema.Literal(1),
});

export type Budgets = typeof budgetsFile.Type;

export interface Observation {
  readonly lane: Lane;
  readonly metric: string;
  readonly scenario: string | null;
  readonly environment: string;
  readonly value: number;
  readonly paired: number | null;
  readonly note: string;
  readonly runs: {
    readonly a: readonly number[];
    readonly b: readonly number[];
  };
}

export interface Verdict {
  readonly ok: boolean;
  readonly text: string;
}

const environmentsOf = (
  lane: Lane,
  nodeEnvironments: readonly string[]
): readonly string[] => {
  if (lane === "node") {
    return nodeEnvironments;
  }
  return lane === "gpu" ? [GPU_ENVIRONMENT] : [lane];
};

export const requiredRows = (
  lanes: readonly Lane[],
  nodeEnvironments: readonly string[]
) =>
  metricKinds
    .filter((kind) => lanes.includes(kind.lane))
    .flatMap((kind) =>
      environmentsOf(kind.lane, nodeEnvironments).flatMap((environment) =>
        (kind.perScenario ? scenarios.map((each) => each.id) : [null]).map(
          (scenario) => ({ environment, kind, scenario })
        )
      )
    );

const finite = (value: number): boolean => Number.isFinite(value);

const keyOf = (
  metric: string,
  scenario: string | null,
  environment: string
): string => `${metric}|${scenario ?? "-"}|${environment}`;

export const budgetProblems = (budgets: Budgets): string[] => {
  const problems: string[] = [];
  const seen = new Map<string, Limit>();
  for (const limit of budgets.limits) {
    const key = keyOf(limit.metric, limit.scenario, limit.environment);
    if (seen.has(key)) {
      problems.push(`duplicate limit ${key}`);
    }
    seen.set(key, limit);
  }
  const required = requiredRows(
    ["node", "build", "gpu"],
    Object.keys(budgets.nodeProfiles).toSorted()
  );
  const wanted = new Set(
    required.map(({ environment, kind, scenario }) =>
      keyOf(kind.metric, scenario, environment)
    )
  );
  for (const { environment, kind, scenario } of required) {
    const limit = seen.get(keyOf(kind.metric, scenario, environment));
    if (!limit) {
      problems.push(
        `missing limit ${keyOf(kind.metric, scenario, environment)}`
      );
    } else if (
      limit.unit !== kind.unit ||
      limit.direction !== kind.direction ||
      limit.paired !== kind.paired ||
      !finite(limit.value) ||
      limit.value < 0 ||
      !finite(limit.baseline)
    ) {
      problems.push(
        `limit ${keyOf(kind.metric, scenario, environment)} has the wrong unit, direction, paired margin or value`
      );
    }
  }
  for (const key of seen.keys()) {
    if (!wanted.has(key)) {
      problems.push(`unknown limit ${key}`);
    }
  }
  for (const [name, profile] of Object.entries(budgets.nodeProfiles)) {
    const { calibration } = profile;
    if (
      ![
        calibration.median,
        calibration.rounds,
        calibration.minScale,
        calibration.maxScale,
        calibration.maxDrift,
      ].every((value) => finite(value) && value > 0) ||
      calibration.minScale >= calibration.maxScale
    ) {
      problems.push(`node profile ${name} has an incomplete calibration`);
    }
  }
  return problems;
};

const shown = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toPrecision(5);

export const judge = (
  limits: readonly Limit[],
  observations: readonly Observation[],
  required: ReturnType<typeof requiredRows>
): Verdict[] =>
  required.map(({ environment, kind, scenario }) => {
    const where = `${kind.lane} ${scenario ?? "-"} ${kind.metric} [${environment}]`;
    const limit = limits.find(
      (each) =>
        each.metric === kind.metric &&
        each.scenario === scenario &&
        each.environment === environment
    );
    const observed = observations.find(
      (each) =>
        each.metric === kind.metric &&
        each.scenario === scenario &&
        each.environment === environment
    );
    if (!limit) {
      return { ok: false, text: `FAIL ${where} has no limit` };
    }
    if (!observed || !finite(observed.value)) {
      return { ok: false, text: `FAIL ${where} missing measurement` };
    }
    const absolute =
      kind.direction === "min"
        ? observed.value >= limit.value
        : observed.value <= limit.value;
    const pairedOk =
      kind.paired === null ||
      (observed.paired !== null &&
        finite(observed.paired) &&
        (kind.direction === "min"
          ? observed.paired >= kind.paired
          : observed.paired <= kind.paired));
    const sign = kind.direction === "min" ? ">=" : "<=";
    const delta =
      kind.unit === "B"
        ? ` delta=${observed.value - limit.baseline >= 0 ? "+" : ""}${shown(observed.value - limit.baseline)} B`
        : "";
    const pairedText =
      kind.paired === null
        ? ""
        : ` A/B=${observed.paired === null ? "missing" : shown(observed.paired)} (${sign} ${kind.paired})`;
    const ok = absolute && pairedOk;
    return {
      ok,
      text: `${ok ? "ok  " : "FAIL"} ${where} observed=${shown(observed.value)} ${kind.unit} limit ${sign} ${shown(limit.value)} ${kind.unit}${delta}${pairedText}${observed.note === "" ? "" : ` ${observed.note}`}`,
    };
  });

export const exactMetric = (metric: string): boolean =>
  metric.startsWith("assets.");

const proposed = (kind: MetricKind, baseline: number) => {
  if (exactMetric(kind.metric)) {
    return { derivation: "exact baseline", value: baseline };
  }
  if (kind.lane === "build") {
    return {
      derivation: "baseline + max(4096, ceil(0.02 x baseline))",
      value: baseline + Math.max(4096, Math.ceil(0.02 * baseline)),
    };
  }
  const factor = kind.paired ?? 1;
  return {
    derivation:
      kind.metric === "sim.allocatedBytesPerTick"
        ? `${factor} x baseline median, uncalibrated`
        : `${factor} x calibrated baseline median`,
    value: baseline * factor,
  };
};

export const proposeLimits = (
  observations: readonly Observation[],
  required: ReturnType<typeof requiredRows>,
  source: string
): Limit[] =>
  required.flatMap(({ environment, kind, scenario }) => {
    const observed = observations.find(
      (each) =>
        each.metric === kind.metric &&
        each.scenario === scenario &&
        each.environment === environment
    );
    return observed
      ? [
          {
            ...proposed(kind, observed.value),
            baseline: observed.value,
            direction: kind.direction,
            environment,
            metric: kind.metric,
            paired: kind.paired,
            scenario,
            source,
            unit: kind.unit,
          },
        ]
      : [];
  });
