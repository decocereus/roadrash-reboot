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
  environment: Schema.String,
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
  sides: Schema.Struct({ A: Schema.Struct({ revision: Schema.String }) }),
});

type GateResult = typeof gateResult.Type;

const childRuntime = Schema.Struct({
  runtime: Schema.Struct({ cpu: Schema.String }),
});

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
  id: string,
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
    run: { cpu, id, origin, scenarios: runScenarios, unscoped },
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

const cpuOf = Effect.fnUntraced(function* cpuOf(dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const children = (yield* fs
    .readDirectory(path.join(dir, "node"))
    .pipe(Effect.orElseSucceed((): string[] => [])))
    .filter((name) => name.endsWith(".json"))
    .toSorted();
  const [first] = children;
  if (first === undefined) {
    return yield* new ConfigInvalid({
      message: `${dir} has no node child records to read the CPU from.`,
    });
  }
  return (yield* readJson(path.join(dir, "node", first), childRuntime)).runtime
    .cpu;
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
    const id = path.basename(dir);
    const current = recordings.get(result.environment);
    if (!current || current.sideA !== result.sides.A.revision) {
      return yield* new ConfigInvalid({
        message: `${id} measured side A at ${result.sides.A.revision.slice(0, 12)}, and ${recordingFile(result.environment)} holds ${current?.sideA.slice(0, 12) ?? "no recording"}.`,
      });
    }
    const { missing, run } = recordedRunOf(
      result,
      id,
      yield* cpuOf(dir),
      origin
    );
    if (missing.length > 0) {
      return yield* new ConfigInvalid({
        message: `${id} lacks ${missing.join(", ")}`,
      });
    }
    recordings.set(
      result.environment,
      current.runs.some((each) => each.id === id)
        ? current
        : { ...current, runs: [...current.runs, run] }
    );
    lines.push(`recorded ${id} on ${run.cpu} in ${result.environment}`);
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
