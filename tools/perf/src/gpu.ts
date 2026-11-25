import path from "node:path";
import { parseArgs } from "node:util";

import { holdBench } from "@racer/devtools/bench-turn";
import { CurrentHost, HOST_SETTING } from "@racer/devtools/browser-host";
import type { BrowserHost } from "@racer/devtools/browser-host";
import { desktopRuntimeEnv } from "@racer/devtools/desktop";
import { ToolProcesses } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { readBudgets } from "./approved.ts";
import type { ConfigInvalid } from "./config-invalid.ts";
import { measureBar } from "./gpu-bar-capture.ts";
import { probeClock, sourceText } from "./gpu-clock.ts";
import { evaluateGpu, FRAME_RATE, GPU_PAIRS } from "./gpu-frames.ts";
import type { GpuSample } from "./gpu-frames.ts";
import { failed, OPEN_TIMEOUT_S, PARK, REPO_ROOT, rv, RV } from "./gpu-rv.ts";
import {
  racePath,
  reached,
  READY,
  sampleOnce,
  SETTINGS_KEY,
} from "./gpu-sample.ts";
import { clockStatesOf, windowClockLine } from "./gpu-states.ts";
import { MeasurementFailed } from "./measurement-failed.ts";
import { sha256Of } from "./result.ts";
import { scenarios } from "./scenarios.ts";
import { checkoutAt, currentSide, revisionOf } from "./sides.ts";
import type { Side, SideName } from "./sides.ts";

const DEFAULT_BUDGETS = path.join(REPO_ROOT, "tools/perf/budgets.json");
const DEFAULT_OUT = path.join(REPO_ROOT, "tools/perf/results");

const WARM_TICKS = 120;
const DOCTOR_CHECKS = [
  "server process",
  "server answers",
  "build is current",
  "browser process",
  "console watcher",
  "page",
  "page visible",
  "gpu",
];

const USAGE = `Usage:
  node tools/perf/gpu.ts --a <rv run> --b <rv run> [--baseline-ref <rev>] [--budgets <file>] [--out <dir>]
Start both runs first with this checkout's rv: with the working directory in a /tmp clone at the baseline revision for A, and in this checkout for B.`;

interface GpuOptions {
  readonly runs: Readonly<Record<SideName, string>>;
  readonly ref: string | undefined;
  readonly budgets: string;
  readonly out: string;
}

const usage = (message: string) =>
  new UsageError({ message: `${message}\n${USAGE}` });

const readGpuOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) =>
      usage(cause instanceof Error ? cause.message : String(cause)),
    try: () =>
      parseArgs({
        args: args[0] === "--" ? args.slice(1) : [...args],
        options: {
          a: { type: "string" },
          b: { type: "string" },
          "baseline-ref": { type: "string" },
          budgets: { default: DEFAULT_BUDGETS, type: "string" },
          out: { default: DEFAULT_OUT, type: "string" },
        },
      }),
  }).pipe(
    Effect.flatMap(({ values }): Effect.Effect<GpuOptions, UsageError> => {
      const { a, b } = values;
      if (a === undefined || b === undefined || a === b) {
        return Effect.fail(usage("Pass two different rv runs to --a and --b."));
      }
      return Effect.succeed({
        budgets: values.budgets,
        out: values.out,
        ref: values["baseline-ref"],
        runs: { A: a, B: b },
      });
    })
  );

const pageFacts = Schema.Struct({
  dpr: Schema.Number,
  frameRate: Schema.NullOr(Schema.String),
  height: Schema.Number,
  refreshHz: Schema.Number,
  width: Schema.Number,
});

const decodeFacts = Schema.decodeUnknownEffect(
  Schema.fromJsonString(pageFacts)
);

type PageFacts = typeof pageFacts.Type;

const sizeOf = ({
  dpr,
  height,
  width,
}: Pick<PageFacts, "dpr" | "height" | "width">): string =>
  `${width}x${height}@${dpr}`;

const PREPARE = `(async () => {
  const stored = JSON.parse(localStorage.getItem("${SETTINGS_KEY}") ?? "{}");
  localStorage.setItem("${SETTINGS_KEY}", JSON.stringify({ ...stored, frameRate: "${FRAME_RATE}", raceData: false }));
  const stamps = [];
  await new Promise((resolve) => {
    const step = (now) => {
      stamps.push(now);
      if (stamps.length < 241) { requestAnimationFrame(step); } else { resolve(); }
    };
    requestAnimationFrame(step);
  });
  const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]).sort((left, right) => left - right);
  return {
    dpr: devicePixelRatio,
    frameRate: JSON.parse(localStorage.getItem("${SETTINGS_KEY}") ?? "{}").frameRate ?? null,
    height: innerHeight,
    refreshHz: Math.round(1000 / gaps[Math.floor(gaps.length / 2)]),
    width: innerWidth,
  };
})()`;

const say = (line: string) =>
  Effect.sync(() => {
    process.stderr.write(`${line}\n`);
  });

const doctorOf = (run: string) =>
  ToolProcesses.use((processes) =>
    processes.run("/bin/sh", [
      "-c",
      '"$0" "$1" doctor --run "$2" 2>&1; echo "rv-exit=$?"',
      process.execPath,
      RV,
      run,
    ])
  ).pipe(
    Effect.map((output) => output.stdout),
    Effect.mapError(failed(`rv doctor --run ${run}`))
  );

const doctorProblems = (text: string): string[] => [
  ...DOCTOR_CHECKS.filter(
    (check) =>
      !text.split("\n").some((line) => line.startsWith(`ok   ${check}:`))
  ).map((check) => `doctor ${check} is not ok`),
  ...(text.includes("cpu x1, network off")
    ? []
    : ["doctor does not show cpu x1, network off"]),
];

const checkoutOf = (listed: string, run: string): string | null =>
  listed
    .split("\n")
    .find((line) => line.includes(` run ${run} `))
    ?.split(" from ")
    .at(-1) ?? null;

const checkedSides = Effect.fnUntraced(function* checkedSides(
  options: GpuOptions,
  revision: string,
  hostId: string
) {
  const listed = yield* rv(["list"]);
  const elsewhere = [options.runs.A, options.runs.B].filter((run) =>
    listed
      .split("\n")
      .some(
        (line) =>
          line.includes(` run ${run} `) && !line.includes(` host ${hostId} `)
      )
  );
  if (elsewhere.length > 0) {
    return yield* new MeasurementFailed({
      lane: "gpu",
      message: `Run ${elsewhere.join(" and ")} started on another browser host; this lane judges ${hostId}. Start both runs with the same ${HOST_SETTING}:\n${listed}`,
    });
  }
  const B = yield* currentSide(REPO_ROOT);
  const checkouts = {
    A: checkoutOf(listed, options.runs.A),
    B: checkoutOf(listed, options.runs.B),
  };
  if (checkouts.A === null || checkouts.B === null) {
    return yield* new MeasurementFailed({
      lane: "gpu",
      message: `rv list holds no run ${checkouts.A === null ? options.runs.A : options.runs.B}:\n${listed}`,
    });
  }
  const A = yield* checkoutAt(checkouts.A);
  const fs = yield* FileSystem.FileSystem;
  const servedB = yield* fs.realPath(checkouts.B);
  if (A.revision !== revision || servedB !== (yield* fs.realPath(REPO_ROOT))) {
    return yield* new MeasurementFailed({
      lane: "gpu",
      message: `Run ${options.runs.A} must serve A=${revision} (it serves ${A.revision} from ${checkouts.A}), and run ${options.runs.B} must serve this checkout (it serves ${checkouts.B}).`,
    });
  }
  return { A, B };
});

const doctorAll = Effect.fnUntraced(function* doctorAll(
  options: GpuOptions,
  dir: string,
  label: string
) {
  const fs = yield* FileSystem.FileSystem;
  const problems: string[] = [];
  for (const side of ["A", "B"] as const) {
    const text = yield* doctorOf(options.runs[side]);
    yield* fs.writeFileString(
      path.join(dir, `doctor-${label}-${side}.txt`),
      text
    );
    problems.push(
      ...doctorProblems(text).map(
        (problem) => `FAIL ${label} side=${side} ${problem}`
      )
    );
  }
  return problems;
});

const warm = Effect.fnUntraced(function* warm(run: string) {
  for (const scenario of scenarios) {
    yield* rv([
      "open",
      "--run",
      run,
      racePath(scenario),
      "--until",
      READY,
      "--timeout",
      String(OPEN_TIMEOUT_S),
    ]);
    yield* rv([
      "wait",
      "--run",
      run,
      reached(WARM_TICKS),
      "--timeout",
      String(OPEN_TIMEOUT_S),
    ]);
  }
  yield* rv(["open", "--run", run, PARK]);
});

const readPage = (run: string) =>
  rv(["open", "--run", run, PARK]).pipe(
    Effect.andThen(rv(["js", "--run", run, PREPARE])),
    Effect.flatMap(decodeFacts)
  );

type PagesRead =
  | { readonly kind: "refused"; readonly line: string }
  | {
      readonly kind: "read";
      readonly page: Readonly<Record<SideName, PageFacts>>;
    };

export const readPages = Effect.fnUntraced(function* readPages(
  runs: Readonly<Record<SideName, string>>,
  host: Pick<BrowserHost, "id" | "page">
) {
  const page = { A: yield* readPage(runs.A), B: yield* readPage(runs.B) };
  yield* say(`display A ${JSON.stringify(page.A)} B ${JSON.stringify(page.B)}`);
  if (sizeOf(page.A) !== sizeOf(page.B)) {
    const refused: PagesRead = {
      kind: "refused",
      line: `FAIL viewport A=${sizeOf(page.A)} B=${sizeOf(page.B)}: restart the run whose window was resized`,
    };
    return refused;
  }
  if (host.page !== null && sizeOf(page.A) !== sizeOf(host.page)) {
    const refused: PagesRead = {
      kind: "refused",
      line: `FAIL page ${sizeOf(page.A)} on both runs, and ${host.id} judges a ${sizeOf(host.page)} page, the page its budget rows were measured on. A compositor rv did not start is the usual cause, because its layout sizes the window. Stop that compositor, then start both runs again so that rv starts its own session.`,
    };
    return refused;
  }
  const read: PagesRead = { kind: "read", page };
  return read;
});

const stampOf = (ms: number): string =>
  new Date(ms).toISOString().replaceAll(/[:.]/gu, "-");

const identity = (side: Side, run: string) => ({
  dirty: side.dirty,
  revision: side.revision,
  run,
  sourceDigest: side.sourceDigest,
  sourceFiles: side.sourceFiles,
});

const measureGpu = Effect.fn("gpu.measure")(function* measureGpu(
  options: GpuOptions
) {
  const fs = yield* FileSystem.FileSystem;
  const processes = yield* ToolProcesses;
  const host = yield* CurrentHost;
  const environment: string = host.perfEnvironment;
  yield* holdBench(`perf:gpu --a ${options.runs.A} --b ${options.runs.B}`, [
    options.runs.A,
    options.runs.B,
  ]);
  const startedAt = yield* Clock.currentTimeMillis;
  const approved = yield* readBudgets(options.budgets);
  const revision = yield* revisionOf(
    REPO_ROOT,
    options.ref ?? approved.budgets.baseline.revision
  );
  const sides = yield* checkedSides(options, revision, host.id);
  const comparisonId = `gpu-${stampOf(startedAt)}-${revision.slice(0, 7)}-${sides.B.revision.slice(0, 7)}`;
  const dir = path.join(options.out, comparisonId);
  yield* fs.makeDirectory(path.join(dir, "gpu"), { recursive: true });
  yield* say(
    `perf gpu ${comparisonId}: A=${options.runs.A} B=${options.runs.B}`
  );
  const before = yield* doctorAll(options, dir, "doctor-before");
  if (before.length > 0) {
    return { code: 1, lines: [...before, `evidence ${dir}`] };
  }
  const displayFacts = yield* Effect.all(
    host.displayProbes.map((probe) =>
      processes.run(probe.file, probe.args, { env: desktopRuntimeEnv() }).pipe(
        Effect.map(({ stdout }) =>
          stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => probe.keep.test(line))
        )
      )
    )
  );
  const source = yield* probeClock().pipe(
    Effect.mapError(failed("probing the CPU clock"))
  );
  yield* say(sourceText(source));
  const bench = { dir, host, source };
  const pages = yield* readPages(options.runs, host);
  if (pages.kind === "refused") {
    return { code: 1, lines: [pages.line, `evidence ${dir}`] };
  }
  const { page } = pages;
  yield* warm(options.runs.A);
  yield* warm(options.runs.B);
  const samples: GpuSample[] = [];
  for (let pair = 0; pair < GPU_PAIRS; pair += 1) {
    for (const [index, scenario] of scenarios.entries()) {
      const order: readonly SideName[] =
        (pair + index) % 2 === 0 ? ["A", "B"] : ["B", "A"];
      for (const [position, side] of order.entries()) {
        const sample = yield* sampleOnce(
          bench,
          {
            idle: options.runs[side === "A" ? "B" : "A"],
            measured: options.runs[side],
          },
          { pair, position, side },
          scenario
        );
        samples.push(sample);
        yield* fs.writeFileString(
          path.join(dir, "samples.json"),
          JSON.stringify(samples)
        );
        yield* say(
          `gpu ${scenario.id} pair ${pair} ${side} captured at position ${samples.length - 1}, ${windowClockLine(sample)}`
        );
      }
    }
  }
  const bar = yield* measureBar(bench, {
    idle: options.runs.A,
    measured: options.runs.B,
  });
  for (const sample of bar) {
    yield* say(`gpu ${sample.file} captured on B, ${windowClockLine(sample)}`);
  }
  const after = yield* doctorAll(options, dir, "doctor-after");
  const evaluation = evaluateGpu(
    samples,
    bar,
    approved.budgets.limits,
    environment,
    host.page
  );
  const files = yield* Effect.all(
    [...samples, ...bar].map((sample) =>
      fs
        .readFileString(path.join(dir, "gpu", sample.file))
        .pipe(
          Effect.map((text) => ({ file: sample.file, sha256: sha256Of(text) }))
        )
    )
  );
  const clock = clockStatesOf(source, samples, bar);
  const lines = [
    ...after,
    ...evaluation.lines,
    sourceText(source),
    ...clock.lines,
  ];
  const ok = after.length === 0 && evaluation.ok;
  const resultFile = path.join(dir, "result.json");
  yield* fs.writeFileString(
    resultFile,
    JSON.stringify(
      {
        budgets: {
          file: path.relative(REPO_ROOT, options.budgets),
          sha256: approved.sha256,
        },
        clock: {
          source,
          states: clock.states,
          windows: [...samples, ...bar].map((sample) => ({
            clock: sample.clock,
            file: sample.file,
            parkTries: sample.parkTries,
          })),
        },
        comparisonId,
        counts: evaluation.counts,
        display: {
          facts: displayFacts.flat(),
          frameRate: FRAME_RATE,
          page,
        },
        environment,
        files,
        lines,
        observations: evaluation.observations,
        ok,
        order: samples.map(
          (sample) => `${sample.scenario} pair${sample.pair} ${sample.side}`
        ),
        sides: {
          A: identity(sides.A, options.runs.A),
          B: identity(sides.B, options.runs.B),
        },
        version: 1,
        wallMs: (yield* Clock.currentTimeMillis) - startedAt,
      },
      null,
      1
    )
  );
  return {
    code: ok ? 0 : 1,
    lines: [
      ...lines,
      `evidence ${resultFile}`,
      `${ok ? "PASS" : "FAIL"} perf gpu ${comparisonId}`,
    ],
  };
});

export const main = (args: readonly string[]) =>
  readGpuOptions(args).pipe(
    Effect.flatMap(measureGpu),
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
