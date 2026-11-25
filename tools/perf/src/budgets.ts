import { perfEnvironments } from "@racer/devtools/browser-host";
import * as Schema from "effect/Schema";

import { glbNames } from "./build.ts";
import { barMetrics } from "./gpu-bar.ts";
import { median } from "./result.ts";
import { scenarios } from "./scenarios.ts";

export type Lane = "node" | "build" | "gpu";

type Rule = "absolute" | "capped" | "paired" | "normalised";

export interface MetricKind {
  readonly metric: string;
  readonly lane: Lane;
  readonly unit: string;
  readonly direction: "min" | "max";
  readonly headroom: number;
  readonly paired: number | null;
  readonly perScenario: boolean;
  readonly rule: Rule;
}

const SNAPSHOT_BYTES_METRIC = "snapshot.bytes.max";

const NORMALISED_UNIT = "x side-A sim.tick.p95";
const PAIRED_UNIT = "A/B";
export const SIDE_A_METRIC = "sim.tick.p95";
export const UNSCOPED_SIDE_A = "reference-v1";

export const recordedRule = {
  floor: 8,
  headroom: 1.15,
} as const;

const pairedKind = (
  metric: string,
  unit: string,
  direction: "min" | "max",
  margin: number | null
): MetricKind => ({
  direction,
  headroom: recordedRule.headroom,
  lane: "node",
  metric,
  paired: margin,
  perScenario: true,
  rule: "paired",
  unit,
});

const normalisedKind = (metric: string, perScenario = true): MetricKind => ({
  direction: "max",
  headroom: recordedRule.headroom,
  lane: "node",
  metric,
  paired: null,
  perScenario,
  rule: "normalised",
  unit: "ms",
});

const ROOM_ALLOCATION_HEADROOM = 1.1;

const absoluteNodeKind = (metric: string, headroom: number): MetricKind => ({
  direction: "max",
  headroom,
  lane: "node",
  metric,
  paired: null,
  perScenario: true,
  rule: "absolute",
  unit: "B",
});

const roomAllocationKind = (metric: string): MetricKind =>
  absoluteNodeKind(metric, ROOM_ALLOCATION_HEADROOM);

const normalisedMetrics = [
  "snapshot.write.p95",
  "snapshot.restore.p95",
  "snapshot.hash.p95",
  "timing.stamp.trimmedMean",
  "roadLife.tick.p95",
  "plazaPack.tick.p95",
  "lobby.tick.p95",
  "room.tick.p95",
  "room.confirm.p95",
  "room.rollback.p95",
  "room.checkpoint.p50",
] as const;

const unscopedMetrics: ReadonlySet<string> = new Set([
  "roadLife.tick.p95",
  "plazaPack.tick.p95",
  "lobby.tick.p95",
]);

const recordedPairedMetric = "sim.tick.p99";

const nodeKinds: readonly MetricKind[] = [
  pairedKind("sim.ticksPerSecond", "ticks/s", "min", 0.9),
  pairedKind(SIDE_A_METRIC, "ms", "max", 1.15),
  pairedKind(recordedPairedMetric, "ms", "max", null),
  pairedKind("sim.allocatedBytesPerTick", "B", "max", 1.1),
  absoluteNodeKind(SNAPSHOT_BYTES_METRIC, 1),
  ...normalisedMetrics.map((metric) =>
    normalisedKind(metric, !unscopedMetrics.has(metric))
  ),
  roomAllocationKind("room.allocatedBytesPerTick"),
  roomAllocationKind("room.client.allocatedBytesPerTick"),
  roomAllocationKind("room.frame.allocatedBytesPerTick"),
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
  "assets.image.total",
  "assets.texture.total",
].map((metric): MetricKind => ({
  direction: "max",
  headroom: 1,
  lane: "build",
  metric,
  paired: null,
  perScenario: false,
  rule: "absolute",
  unit: "B",
}));

const gpuKind = (
  metric: string,
  unit: string,
  paired: number | null
): MetricKind => ({
  direction: "max",
  headroom: paired ?? 1,
  lane: "gpu",
  metric,
  paired,
  perScenario: true,
  rule: paired === null ? "absolute" : "capped",
  unit,
});

const gpuKinds: readonly MetricKind[] = [
  gpuKind("frame.interval.p50", "ms", 1.1),
  gpuKind("frame.interval.p95", "ms", 1.15),
  gpuKind("frame.interval.p99", "ms", 1.2),
  gpuKind("frame.missedFraction", "share", null),
  gpuKind("riders.cpu.p95", "ms", null),
  gpuKind("tower.cpu.p95", "ms", null),
  gpuKind("main.longTask.count", "tasks", null),
  gpuKind("main.longTask.blockingMs", "ms", null),
  gpuKind("render.calls.max", "calls", null),
  gpuKind("render.triangles.max", "triangles", null),
  gpuKind("render.shadowTriangles.max", "triangles", null),
  gpuKind("render.programs.max", "programs", null),
  gpuKind("render.textures.max", "textures", null),
  ...barMetrics.map(({ metric, unit }): MetricKind => ({
    ...gpuKind(metric, unit, null),
    perScenario: false,
  })),
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

export const limitUnit = (kind: MetricKind): string => {
  switch (kind.rule) {
    case "normalised": {
      return NORMALISED_UNIT;
    }
    case "paired": {
      return PAIRED_UNIT;
    }
    case "absolute":
    case "capped": {
      return kind.unit;
    }
    default: {
      return kind.rule satisfies never;
    }
  }
};

export const recordedLimit = (kind: MetricKind): boolean =>
  kind.rule === "normalised" ||
  (kind.rule === "paired" && kind.paired === null);

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

interface Verdict {
  readonly ok: boolean;
  readonly text: string;
}

const environmentsOf = (
  lane: Lane,
  nodeEnvironments: readonly string[],
  gpuEnvironments: readonly string[]
): readonly string[] => {
  switch (lane) {
    case "node": {
      return nodeEnvironments;
    }
    case "gpu": {
      return gpuEnvironments;
    }
    case "build": {
      return [lane];
    }
    default: {
      return lane satisfies never;
    }
  }
};

export const requiredRows = (
  lanes: readonly Lane[],
  nodeEnvironments: readonly string[],
  gpuEnvironments: readonly string[]
) =>
  metricKinds
    .filter((kind) => lanes.includes(kind.lane))
    .flatMap((kind) =>
      environmentsOf(kind.lane, nodeEnvironments, gpuEnvironments).flatMap(
        (environment) =>
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
    Object.keys(budgets.nodeProfiles).toSorted(),
    perfEnvironments
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
      limit.unit !== limitUnit(kind) ||
      (kind.rule === "paired" &&
        kind.paired !== null &&
        limit.value !== kind.paired) ||
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

const warnsOnly: ReadonlySet<string> = new Set(["render.triangles.max"]);

const sideAOf = (
  observations: readonly Observation[],
  scenario: string | null,
  environment: string
): number => {
  const measured = observations.find(
    (each) =>
      each.metric === SIDE_A_METRIC &&
      each.scenario === (scenario ?? UNSCOPED_SIDE_A) &&
      each.environment === environment
  );
  return measured && measured.runs.a.length > 0
    ? median(measured.runs.a)
    : Number.NaN;
};

const sideAMissing = (
  kind: MetricKind,
  observed: Observation | undefined,
  sideA: number
): boolean => {
  switch (kind.rule) {
    case "normalised": {
      return observed !== undefined && !(finite(sideA) && sideA > 0);
    }
    case "paired": {
      return (
        observed !== undefined &&
        !(
          observed.runs.a.some(finite) &&
          observed.paired !== null &&
          finite(observed.paired)
        )
      );
    }
    case "absolute":
    case "capped": {
      return false;
    }
    default: {
      return kind.rule satisfies never;
    }
  }
};

interface Row {
  readonly where: string;
  readonly kind: MetricKind;
  readonly limit: Limit | undefined;
  readonly observed: Observation | undefined;
  readonly scenario: string | null;
  readonly sideA: number;
}

const rowsOf = (
  limits: readonly Limit[],
  observations: readonly Observation[],
  required: ReturnType<typeof requiredRows>
): Row[] =>
  required.map(({ environment, kind, scenario }) => ({
    kind,
    limit: limits.find(
      (each) =>
        each.metric === kind.metric &&
        each.scenario === scenario &&
        each.environment === environment
    ),
    observed: observations.find(
      (each) =>
        each.metric === kind.metric &&
        each.scenario === scenario &&
        each.environment === environment
    ),
    scenario,
    sideA: sideAOf(observations, scenario, environment),
    where: `${kind.lane} ${scenario ?? "-"} ${kind.metric} [${environment}]`,
  }));

const sideAFailure = ({ kind, scenario, where }: Row): string =>
  kind.rule === "normalised"
    ? `FAIL ${where} SideAMissing: this row is judged over side A's ${SIDE_A_METRIC} of ${scenario ?? UNSCOPED_SIDE_A}, and the run measured none`
    : `FAIL ${where} SideAMissing: this row is judged by its A/B ratio, and the run measured no side A`;

const within = (
  direction: "min" | "max",
  value: number,
  limit: number
): boolean => (direction === "min" ? value >= limit : value <= limit);

const verdictOf = ({ kind, limit, observed, sideA, where }: Row): Verdict => {
  if (!limit) {
    return { ok: false, text: `FAIL ${where} has no limit` };
  }
  if (!observed || !finite(observed.value)) {
    return { ok: false, text: `FAIL ${where} missing measurement` };
  }
  const sign = kind.direction === "min" ? ">=" : "<=";
  const note = observed.note === "" ? "" : ` ${observed.note}`;
  const verdict = (passed: boolean, text: string): Verdict => {
    const ok = passed || warnsOnly.has(kind.metric);
    const missed = ok ? "WARN" : "FAIL";
    return { ok, text: `${passed ? "ok  " : missed} ${where} ${text}${note}` };
  };
  switch (kind.rule) {
    case "normalised": {
      const normalised = observed.value / sideA;
      return verdict(
        within(kind.direction, normalised, limit.value),
        `observed=${shown(normalised)} ${NORMALISED_UNIT} limit ${sign} ${shown(limit.value)} (${shown(observed.value)} ${kind.unit} over side A ${shown(sideA)} ms)`
      );
    }
    case "paired": {
      const paired = observed.paired ?? Number.NaN;
      return verdict(
        within(kind.direction, paired, limit.value),
        `observed A/B=${shown(paired)} limit ${sign} ${shown(limit.value)} (B=${shown(observed.value)} ${kind.unit})`
      );
    }
    case "absolute":
    case "capped": {
      const delta =
        kind.unit === "B"
          ? ` delta=${observed.value - limit.baseline >= 0 ? "+" : ""}${shown(observed.value - limit.baseline)} B`
          : "";
      const pairedOk =
        kind.paired === null ||
        (observed.paired !== null &&
          finite(observed.paired) &&
          within(kind.direction, observed.paired, kind.paired));
      const pairedText =
        kind.paired === null
          ? ""
          : ` A/B=${observed.paired === null ? "missing" : shown(observed.paired)} (${sign} ${kind.paired})`;
      return verdict(
        within(kind.direction, observed.value, limit.value) && pairedOk,
        `observed=${shown(observed.value)} ${kind.unit} limit ${sign} ${shown(limit.value)} ${kind.unit}${delta}${pairedText}`
      );
    }
    default: {
      return kind.rule satisfies never;
    }
  }
};

export interface Judgement {
  readonly evidence: readonly string[];
  readonly verdicts: readonly Verdict[];
}

export const judge = (
  limits: readonly Limit[],
  observations: readonly Observation[],
  required: ReturnType<typeof requiredRows>
): Judgement => {
  const rows = rowsOf(limits, observations, required);
  const missing = rows.filter((row) =>
    sideAMissing(row.kind, row.observed, row.sideA)
  );
  return {
    evidence: missing.map(sideAFailure),
    verdicts: rows.filter((row) => !missing.includes(row)).map(verdictOf),
  };
};

export const exactMetric = (metric: string): boolean =>
  metric.startsWith("assets.") || metric === SNAPSHOT_BYTES_METRIC;

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
  const factor = kind.headroom;
  return {
    derivation: kind.metric.endsWith("allocatedBytesPerTick")
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
    if (kind.rule === "normalised" || kind.rule === "paired") {
      return [];
    }
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
