import path from "node:path";
import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { checkApproved, readBudgets } from "./approved.ts";
import { buildSide } from "./build.ts";
import { ConfigInvalid } from "./config-invalid.ts";
import {
  evaluateBaseline,
  evaluateGate,
  lanesOf,
  portableLanes,
  samplesRecord,
} from "./evaluate.ts";
import type { Evaluation, Samples } from "./evaluate.ts";
import { nodeLane } from "./node-lane.ts";
import type { NodeLane } from "./node-lane.ts";
import { sha256Of } from "./result.ts";
import { scenarioHash, scenarios } from "./scenarios.ts";
import { selectWindows } from "./select.ts";
import {
  currentSide,
  identityOf,
  materializedSide,
  revisionOf,
} from "./sides.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const DEFAULT_BUDGETS = path.join(REPO_ROOT, "tools/perf/budgets.json");
const DEFAULT_OUT = path.join(REPO_ROOT, "tools/perf/results");

const USAGE = `Usage:
  node tools/perf/gate.ts [--baseline-ref <rev>] [--budgets <file>] [--lanes node,build] [--out <dir>]
  node tools/perf/gate.ts --check [--budgets <file>]
  node tools/perf/gate.ts baseline [--baseline-ref <rev>] [--lanes node,build] [--out <dir>]
  node tools/perf/gate.ts --evaluate <samples.json> [--budgets <file>]
  node tools/perf/gate.ts --select-window [--out <dir>]`;

type GateOptions =
  | { readonly kind: "select"; readonly out: string }
  | { readonly kind: "check"; readonly budgets: string }
  | {
      readonly kind: "evaluate";
      readonly samples: string;
      readonly budgets: string;
    }
  | {
      readonly kind: "measure";
      readonly mode: Samples["mode"];
      readonly ref: string | undefined;
      readonly budgets: string;
      readonly lanes: Samples["lanes"];
      readonly out: string;
    };

const usage = (message: string) =>
  new UsageError({ message: `${message}\n${USAGE}` });

const readGateOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) =>
      usage(cause instanceof Error ? cause.message : String(cause)),
    try: () =>
      parseArgs({
        allowPositionals: true,
        args: args[0] === "--" ? args.slice(1) : [...args],
        options: {
          "baseline-ref": { type: "string" },
          budgets: { default: DEFAULT_BUDGETS, type: "string" },
          check: { default: false, type: "boolean" },
          evaluate: { type: "string" },
          lanes: { default: portableLanes.join(","), type: "string" },
          out: { default: DEFAULT_OUT, type: "string" },
          "select-window": { default: false, type: "boolean" },
        },
      }),
  }).pipe(
    Effect.flatMap(
      ({ positionals, values }): Effect.Effect<GateOptions, UsageError> => {
        const [command, ...rest] = positionals;
        const lanes = lanesOf(values.lanes);
        if (
          rest.length > 0 ||
          (command !== undefined && command !== "baseline")
        ) {
          return Effect.fail(
            usage(`Unknown argument ${positionals.join(" ")}`)
          );
        }
        if (values["select-window"]) {
          return Effect.succeed({ kind: "select", out: values.out });
        }
        if (values.check) {
          return Effect.succeed({ budgets: values.budgets, kind: "check" });
        }
        if (values.evaluate !== undefined) {
          return Effect.succeed({
            budgets: values.budgets,
            kind: "evaluate",
            samples: values.evaluate,
          });
        }
        if (!lanes) {
          return Effect.fail(usage(`Unknown lanes ${values.lanes}`));
        }
        return Effect.succeed({
          budgets: values.budgets,
          kind: "measure",
          lanes,
          mode: command === "baseline" ? "baseline" : "gate",
          out: values.out,
          ref: values["baseline-ref"],
        });
      }
    )
  );

const decodeSamples = Schema.decodeUnknownEffect(
  Schema.fromJsonString(samplesRecord)
);

const say = (line: string) =>
  Effect.sync(() => {
    process.stderr.write(`${line}\n`);
  });

const stampOf = (ms: number): string =>
  new Date(ms).toISOString().replaceAll(/[:.]/gu, "-");

const timed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* timedEffect() {
    const started = yield* Clock.currentTimeMillis;
    const value = yield* effect;
    return { ms: (yield* Clock.currentTimeMillis) - started, value };
  });

const measure = Effect.fn("gate.measure")(function* measure(
  options: Extract<GateOptions, { kind: "measure" }>
) {
  const fs = yield* FileSystem.FileSystem;
  const approved =
    options.mode === "gate" ? yield* readBudgets(options.budgets) : null;
  const startedAt = yield* Clock.currentTimeMillis;
  const B = yield* currentSide(REPO_ROOT);
  const ref = options.ref ?? approved?.budgets.baseline.revision ?? "HEAD";
  const revision = yield* revisionOf(REPO_ROOT, ref);
  const comparisonId = `${options.mode}-${stampOf(startedAt)}-${revision.slice(0, 7)}-${B.revision.slice(0, 7)}`;
  const dir = path.join(options.out, comparisonId);
  yield* fs.makeDirectory(path.join(dir, "node"), { recursive: true });
  yield* say(
    `perf ${options.mode} ${comparisonId}: A=${revision} B=${B.revision}${B.dirty ? " (dirty)" : ""}`
  );
  const clone = yield* timed(materializedSide(B, revision));
  const A = clone.value.side;
  yield* say(`A cloned in ${clone.ms} ms, ${clone.value.diskKilobytes} KiB`);
  const sides = { A: yield* identityOf(A), B: yield* identityOf(B) };
  const samplesFile = path.join(dir, "samples.json");
  let samples: Samples = {
    build: null,
    comparisonId,
    lanes: [],
    mode: options.mode,
    node: [],
    sides,
    version: 1,
  };
  const save = (next: Samples) =>
    fs.writeFileString(samplesFile, JSON.stringify(next)).pipe(Effect.as(next));
  let nodeMs = 0;
  let buildMs = 0;
  if (options.lanes.includes("node")) {
    const startedNode = yield* Clock.currentTimeMillis;
    const node: NodeLane[] = [];
    for (const scenario of scenarios) {
      node.push(yield* nodeLane(scenario, { A, B }, path.join(dir, "node")));
      yield* say(`node ${scenario.id} measured`);
    }
    nodeMs = (yield* Clock.currentTimeMillis) - startedNode;
    samples = yield* save({ ...samples, lanes: ["node"], node });
  }
  if (options.lanes.includes("build")) {
    const ran = yield* timed(
      Effect.all({ A: buildSide(A, dir), B: buildSide(B, dir) })
    );
    buildMs = ran.ms;
    samples = yield* save({
      ...samples,
      build: ran.value,
      lanes: [...samples.lanes, "build"],
    });
  }
  samples = yield* save(samples);
  const evaluation: Evaluation & { readonly proposal?: unknown } = approved
    ? evaluateGate(samples, approved.budgets)
    : evaluateBaseline(samples);
  const wallMs = {
    build: buildMs,
    materialize: clone.ms,
    node: nodeMs,
    total: (yield* Clock.currentTimeMillis) - startedAt,
  };
  const resultFile = path.join(dir, "result.json");
  const samplesText = yield* fs.readFileString(samplesFile);
  yield* fs.writeFileString(
    resultFile,
    JSON.stringify(
      {
        budgets: approved
          ? {
              file: path.relative(REPO_ROOT, options.budgets),
              sha256: approved.sha256,
            }
          : null,
        cloneKilobytes: clone.value.diskKilobytes,
        comparisonId,
        environment: evaluation.environment,
        files: [{ file: "samples.json", sha256: sha256Of(samplesText) }],
        lanes: samples.lanes,
        lines: evaluation.lines,
        mode: options.mode,
        observations: evaluation.observations,
        ok: evaluation.ok,
        proposal: evaluation.proposal ?? null,
        scenarios: scenarios.map((scenario) => ({
          hash: scenarioHash(scenario),
          id: scenario.id,
        })),
        sides,
        version: 1,
        wallMs,
      },
      null,
      1
    )
  );
  const verdict = approved
    ? `${evaluation.ok ? "PASS" : "FAIL"} perf gate ${comparisonId}`
    : `MEASUREMENT ONLY ${evaluation.ok ? "complete" : "FAILED"} ${comparisonId}`;
  return {
    code: evaluation.ok ? 0 : 1,
    lines: [...evaluation.lines, `evidence ${resultFile}`, verdict],
  };
});

const evaluateFile = Effect.fn("gate.evaluate")(function* evaluateFile(
  options: Extract<GateOptions, { kind: "evaluate" }>
) {
  const fs = yield* FileSystem.FileSystem;
  const { budgets } = yield* readBudgets(options.budgets);
  const samples = yield* fs.readFileString(options.samples).pipe(
    Effect.flatMap(decodeSamples),
    Effect.mapError(
      (cause) =>
        new ConfigInvalid({
          cause,
          message: `${options.samples} is not a perf samples file.`,
        })
    )
  );
  const evaluation = evaluateGate(samples, budgets);
  return {
    code: evaluation.ok ? 0 : 1,
    lines: [
      ...evaluation.lines,
      `${evaluation.ok ? "PASS" : "FAIL"} perf evaluate ${samples.comparisonId}`,
    ],
  };
});

const run = (options: GateOptions) => {
  if (options.kind === "select") {
    return selectWindows(options.out);
  }
  if (options.kind === "check") {
    return checkApproved(REPO_ROOT, options.budgets).pipe(
      Effect.map((lines) => ({ code: 0, lines }))
    );
  }
  return options.kind === "evaluate" ? evaluateFile(options) : measure(options);
};

export const main = (args: readonly string[]) =>
  readGateOptions(args).pipe(
    Effect.flatMap(run),
    Effect.catchTags({
      ConfigInvalid: (invalid: ConfigInvalid) =>
        Effect.succeed({ code: 2, lines: [`CONFIG ${invalid.message}`] }),
      UsageError: (invalid: UsageError) =>
        Effect.succeed({ code: 2, lines: [invalid.message] }),
    }),
    Effect.flatMap(({ code, lines }) =>
      Effect.sync(() => {
        process.stdout.write(`${lines.join("\n")}\n`);
        process.exitCode = code;
      })
    )
  );
