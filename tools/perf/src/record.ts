import path from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";

import { UsageError } from "@racer/devtools/usage-error";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { readBudgets } from "./approved.ts";
import {
  SIDE_A_METRIC,
  metricKinds,
  recordedLimit,
  requiredRows,
} from "./budgets.ts";
import type { Budgets, Limit } from "./budgets.ts";
import { ConfigInvalid } from "./config-invalid.ts";
import { currentProtocol, protocolAccepted } from "./protocol.ts";
import {
  derive,
  readRecordings,
  readingsOf,
  recording,
  recordingFile,
} from "./recorded.ts";
import type { RecordedRun, Recording, Recordings } from "./recorded.ts";
import { median, sha256Of } from "./result.ts";
import { scenarios } from "./scenarios.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const BUDGETS = path.join(REPO_ROOT, "tools/perf/budgets.json");

export const gateResult = Schema.Struct({
  comparisonId: Schema.String,
  environment: Schema.String,
  evidence: Schema.Array(Schema.String),
  load: Schema.NullOr(
    Schema.Struct({ limit: Schema.Number, peak: Schema.Number })
  ),
  mode: Schema.String,
  observations: Schema.Array(
    Schema.Struct({
      environment: Schema.String,
      lane: Schema.String,
      metric: Schema.String,
      paired: Schema.NullOr(Schema.Number),
      runs: Schema.Struct({
        a: Schema.Array(Schema.NullOr(Schema.Number)),
        b: Schema.Array(Schema.NullOr(Schema.Number)),
      }),
      scenario: Schema.NullOr(Schema.String),
      value: Schema.Number,
    })
  ),
  protocol: Schema.String,
  sides: Schema.Struct({
    A: Schema.Struct({ revision: Schema.String }),
    B: Schema.Struct({ dirty: Schema.Boolean, revision: Schema.String }),
  }),
});

export type GateResult = typeof gateResult.Type;

const childRuntime = Schema.Struct({
  runtime: Schema.Struct({
    arch: Schema.String,
    cpu: Schema.String,
    platform: Schema.String,
  }),
});

export type ChildRuntime = typeof childRuntime.Type;

const nodeRows = metricKinds.filter((kind) => kind.lane === "node");

const recordedKinds = (rule: "normalised" | "paired", perScenario: boolean) =>
  nodeRows.filter(
    (kind) => kind.rule === rule && kind.perScenario === perScenario
  );

interface RunReading {
  readonly missing: readonly string[];
  readonly run: RecordedRun;
}

const recordedRunOf = (
  result: GateResult,
  cpu: string,
  origin: string
): RunReading => {
  const find = (metric: string, scenario: string | null) =>
    result.observations.find(
      (each) =>
        each.lane === "node" &&
        each.metric === metric &&
        each.scenario === scenario
    );
  const missing: string[] = [];
  const valueOf = (metric: string, scenario: string | null): number => {
    const observed = find(metric, scenario);
    if (!observed || !Number.isFinite(observed.value)) {
      missing.push(`${metric} ${scenario ?? "-"}`);
      return Number.NaN;
    }
    return observed.value;
  };
  const runScenarios = scenarios.map(({ id: scenario }) => {
    const sideA = (find(SIDE_A_METRIC, scenario)?.runs.a ?? []).filter(
      (each) => each !== null
    );
    if (sideA.length === 0) {
      missing.push(`side A ${SIDE_A_METRIC} ${scenario}`);
    }
    return {
      paired: Object.fromEntries(
        recordedKinds("paired", true).map((kind) => [
          kind.metric,
          find(kind.metric, scenario)?.paired ?? Number.NaN,
        ])
      ),
      rows: Object.fromEntries(
        recordedKinds("normalised", true).map((kind) => [
          kind.metric,
          valueOf(kind.metric, scenario),
        ])
      ),
      scenario,
      sideA: median(sideA),
    };
  });
  const unscoped = Object.fromEntries(
    recordedKinds("normalised", false).map((kind) => [
      kind.metric,
      valueOf(kind.metric, null),
    ])
  );
  const unpaired = runScenarios.flatMap(({ paired, scenario }) =>
    Object.entries(paired)
      .filter(([, value]) => !Number.isFinite(value))
      .map(([metric]) => `${metric} A/B ${scenario}`)
  );
  return {
    missing: [...missing, ...unpaired],
    run: {
      b: result.sides.B.revision,
      cpu,
      id: result.comparisonId,
      load: result.load,
      mode: "gate",
      origin,
      protocol: result.protocol,
      scenarios: runScenarios,
      unscoped,
    },
  };
};

export type Admission =
  | { readonly kind: "refused"; readonly problems: readonly string[] }
  | { readonly kind: "already recorded"; readonly id: string }
  | { readonly kind: "recorded"; readonly run: RecordedRun };

const sameReadings = (left: RecordedRun, right: RecordedRun): boolean =>
  JSON.stringify({ ...left, origin: "" }) ===
  JSON.stringify({ ...right, origin: "" });

export const admit = (
  result: GateResult,
  children: readonly ChildRuntime[],
  recorded: Recording | undefined,
  origin: string,
  protocol: string
): Admission => {
  const id = result.comparisonId;
  const file = recordingFile(result.environment);
  const environments = [
    ...new Set(
      children.map(({ runtime }) => `node-${runtime.platform}-${runtime.arch}`)
    ),
  ];
  const cpus = [...new Set(children.map(({ runtime }) => runtime.cpu))];
  const problems = [
    ...(recorded ? [] : [`${file} does not exist`]),
    ...(recorded && recorded.sideA !== result.sides.A.revision
      ? [
          `it measured side A at ${result.sides.A.revision.slice(0, 12)}, and ${file} holds ${recorded.sideA.slice(0, 12)}`,
        ]
      : []),
    ...(result.mode === "gate"
      ? []
      : [`it is a ${result.mode} run, and only gate runs are recorded`]),
    ...(result.load !== null && result.load.peak > result.load.limit
      ? [
          `it has no verdict: the load peaked at ${result.load.peak} over the limit of ${result.load.limit}`,
        ]
      : []),
    ...(result.evidence.length > 0
      ? [`it failed as evidence: ${result.evidence.join("; ")}`]
      : []),
    ...(result.sides.B.dirty ? ["its side B had uncommitted changes"] : []),
    ...(protocolAccepted(result.protocol, protocol)
      ? []
      : [
          `it was measured under protocol ${result.protocol.slice(0, 12)}, and this harness measures under ${protocol.slice(0, 12)} with no compatibility declared`,
        ]),
    ...(environments.length === 1 && environments[0] === result.environment
      ? []
      : [
          `its node children ran on ${environments.join(", ") || "nothing"}, and the result is filed for ${result.environment}`,
        ]),
    ...(cpus.length === 1
      ? []
      : [
          `its node children disagree on the CPU: ${cpus.join(", ") || "none recorded"}`,
        ]),
  ];
  const { missing, run } = recordedRunOf(result, cpus.join(", "), origin);
  const all = [
    ...problems,
    ...(missing.length > 0 ? [`it lacks ${missing.join(", ")}`] : []),
  ];
  if (all.length > 0) {
    return { kind: "refused", problems: all };
  }
  const earlier = recorded?.runs.find((each) => each.id === id);
  if (earlier === undefined) {
    return { kind: "recorded", run };
  }
  return sameReadings(earlier, run)
    ? { id, kind: "already recorded" }
    : {
        kind: "refused",
        problems: [
          `${file} already records ${id} with other readings, so this result conflicts with it`,
        ],
      };
};

const derivedBudgets = (budgets: Budgets, recordings: Recordings): Budgets => {
  const replace = (limit: Limit): Limit => {
    const kind = metricKinds.find((each) => each.metric === limit.metric);
    const recorded = recordings.get(limit.environment);
    if (!kind || !recordedLimit(kind) || !recorded) {
      return limit;
    }
    const derived = derive(readingsOf(recorded, kind, limit.scenario));
    return derived ? { ...limit, ...derived } : limit;
  };
  return { ...budgets, limits: budgets.limits.map(replace) };
};

const encodeRecording = Schema.encodeSync(recording);

const usage = `node tools/perf/record.ts add --origin "<where the runs came from>" <gate result dir>...
node tools/perf/record.ts derive`;

const readJson = Effect.fnUntraced(function* readJson<A>(
  file: string,
  schema: Schema.Codec<A, unknown>
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(file)
    .pipe(
      Effect.mapError(
        (cause) => new ConfigInvalid({ cause, message: `Cannot read ${file}.` })
      )
    );
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(
    text
  ).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigInvalid({
          cause,
          message: `${file} is not what it should be.`,
        })
    )
  );
});

const childrenOf = Effect.fnUntraced(function* childrenOf(dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const names = (yield* fs
    .readDirectory(path.join(dir, "node"))
    .pipe(Effect.orElseSucceed((): string[] => [])))
    .filter((name) => name.endsWith(".json"))
    .toSorted();
  const children: ChildRuntime[] = [];
  for (const name of names) {
    children.push(yield* readJson(path.join(dir, "node", name), childRuntime));
  }
  return children;
});

const writeRecording = Effect.fnUntraced(function* writeRecording(
  environment: string,
  recorded: Recording
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFile(
    path.join(REPO_ROOT, recordingFile(environment)),
    gzipSync(`${JSON.stringify(encodeRecording(recorded))}\n`)
  );
});

const add = Effect.fnUntraced(function* add(
  origin: string,
  dirs: readonly string[]
) {
  const { budgets } = yield* readBudgets(BUDGETS);
  const recordings = new Map(yield* readRecordings(REPO_ROOT, budgets));
  const lines: string[] = [];
  for (const dir of dirs) {
    const result = yield* readJson(path.join(dir, "result.json"), gateResult);
    const recorded = recordings.get(result.environment);
    const admission = admit(
      result,
      yield* childrenOf(dir),
      recorded,
      origin,
      currentProtocol
    );
    if (admission.kind === "refused") {
      return yield* new ConfigInvalid({
        message: `${dir} is not recorded: ${admission.problems.join("; ")}.`,
      });
    }
    if (admission.kind === "already recorded") {
      lines.push(`already recorded ${admission.id}, nothing added`);
      continue;
    }
    if (recorded) {
      recordings.set(result.environment, {
        ...recorded,
        runs: [...recorded.runs, admission.run],
      });
    }
    lines.push(
      `recorded ${admission.run.id} on ${admission.run.cpu} in ${result.environment}`
    );
  }
  for (const [environment, recorded] of recordings) {
    yield* writeRecording(environment, recorded);
  }
  return lines;
});

const deriveAll = Effect.fnUntraced(function* deriveAll() {
  const fs = yield* FileSystem.FileSystem;
  const { budgets } = yield* readBudgets(BUDGETS);
  const recordings = yield* readRecordings(REPO_ROOT, budgets);
  const derived = derivedBudgets(budgets, recordings);
  const hashes = new Map<string, string>();
  for (const environment of recordings.keys()) {
    const file = recordingFile(environment);
    hashes.set(file, sha256Of(yield* fs.readFile(path.join(REPO_ROOT, file))));
  }
  const next: Budgets = {
    ...derived,
    baseline: {
      ...derived.baseline,
      raw: derived.baseline.raw.map((each) => ({
        ...each,
        sha256: hashes.get(each.file) ?? each.sha256,
      })),
    },
  };
  yield* fs.writeFileString(BUDGETS, `${JSON.stringify(next, null, 2)}\n`);
  const recordedRows = requiredRows(
    ["node"],
    [...recordings.keys()].toSorted(),
    []
  ).filter(({ kind }) => recordedLimit(kind));
  return [
    `derived ${recordedRows.length} recorded limits from ${[...recordings.values()].reduce((total, each) => total + each.runs.length, 0)} recorded runs; run oxfmt on tools/perf/budgets.json, then node tools/perf/gate.ts --check`,
  ];
});

export const recordMain = Effect.fnUntraced(function* run(
  argv: readonly string[]
) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args: [...argv],
    options: { origin: { type: "string" } },
  });
  const [command, ...dirs] = positionals;
  if (command === "add" && values.origin !== undefined && dirs.length > 0) {
    return yield* add(values.origin, dirs);
  }
  if (command === "derive" && dirs.length === 0) {
    return yield* deriveAll();
  }
  return yield* new UsageError({ message: usage });
});
