import path from "node:path";
import { parseArgs } from "node:util";

import { ToolProcesses } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { readBudgets } from "./approved.ts";
import { GPU_ENVIRONMENT } from "./budgets.ts";
import type { ConfigInvalid } from "./config-invalid.ts";
import {
  evaluateGpu,
  FRAME_RATE,
  GPU_PAIRS,
  pageCapture,
  racedCapture,
} from "./gpu-frames.ts";
import type { GpuSample } from "./gpu-frames.ts";
import { MeasurementFailed } from "./measurement-failed.ts";
import { sha256Of } from "./result.ts";
import { scenarios } from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";
import { checkoutAt, currentSide, revisionOf } from "./sides.ts";
import type { Side, SideName } from "./sides.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const RV = path.join(REPO_ROOT, "tools/verify/rushline.ts");
const DEFAULT_BUDGETS = path.join(REPO_ROOT, "tools/perf/budgets.json");
const DEFAULT_OUT = path.join(REPO_ROOT, "tools/perf/results");

const PARK = "/kit";
const WARM_TICKS = 120;
const OPEN_TIMEOUT_S = 90;
const WINDOW_TIMEOUT_S = 240;
const SETTINGS_KEY = "rushline.settings.v1";
const READY =
  "globalThis.__rushlineBench !== undefined && globalThis.__rushlineProfile !== undefined";
const DOCTOR_CHECKS = [
  "server process",
  "server answers",
  "build is current",
  "helium process",
  "console watcher",
  "page",
  "page visible",
  "gpu",
];

const USAGE = `Usage:
  node tools/perf/gpu.ts --a <rv run> --b <rv run> [--baseline-ref <rev>] [--budgets <file>] [--out <dir>]
Start both runs first: rv up from a /tmp clone at the baseline revision for A, and from this checkout for B.`;

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

const failed = (message: string) => (cause: { readonly message: string }) =>
  new MeasurementFailed({
    cause,
    lane: "gpu",
    message: `${message}: ${cause.message}`,
  });

const rv = (args: readonly string[]) =>
  ToolProcesses.use((processes) =>
    processes.run(process.execPath, [RV, ...args], { cwd: REPO_ROOT })
  ).pipe(
    Effect.map((output) => output.stdout.trim()),
    Effect.mapError(failed(`rv ${args.slice(0, 3).join(" ")}`))
  );

const decodeInstalled = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({ tick: Schema.Number, visibility: Schema.String })
  )
);

const decodeCapture = Schema.decodeUnknownEffect(
  Schema.fromJsonString(pageCapture)
);

const decodeRaced = Schema.decodeUnknownEffect(
  Schema.fromJsonString(racedCapture)
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

const PREPARE = `(async () => {
  const stored = JSON.parse(localStorage.getItem("${SETTINGS_KEY}") ?? "{}");
  localStorage.setItem("${SETTINGS_KEY}", JSON.stringify({ ...stored, frameRate: "${FRAME_RATE}" }));
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

const INSTALL = `(() => {
  const store = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      store.push({ duration: entry.duration, name: entry.name, start: entry.startTime });
    }
  });
  observer.observe({ buffered: true, type: "longtask" });
  globalThis.__perfLongTasks = { observer, store };
  return { tick: globalThis.__rushlineBench.info().lastTick, visibility: document.visibilityState };
})()`;

const rideTo = (to: number) => `
    ride: profile
      .window(0, ${to})
      .filter((frame) => frame.race === info.race)
      .map(({ created, frame, tick }) => ({ created, frame, tick })),`;

const collect = ({ window }: Scenario, side: SideName) => `(() => {
  const tasks = globalThis.__perfLongTasks;
  for (const entry of tasks.observer.takeRecords()) {
    tasks.store.push({ duration: entry.duration, name: entry.name, start: entry.startTime });
  }
  tasks.observer.disconnect();
  const bench = globalThis.__rushlineBench;
  const info = bench.info();
  const profile = globalThis.__rushlineProfile;
  return {
    bench: info,
    frameRate: JSON.parse(localStorage.getItem("${SETTINGS_KEY}") ?? "{}").frameRate ?? null,
    frames: profile.window(${window.from}, ${window.to}),
    longTasks: tasks.store,${side === "B" ? rideTo(window.to) : ""}
    parts: profile.info().parts,
    rows: bench.window(${window.from}, ${window.to}),
    viewport: { dpr: devicePixelRatio, height: innerHeight, width: innerWidth },
    visibility: document.visibilityState,
  };
})()`;

const racePath = (scenario: Scenario): string =>
  scenario.bench === "reference"
    ? "/?stress=reference&rung=0"
    : "/?stress&rung=0";

const reached = (tick: number): string =>
  `globalThis.__rushlineBench.info().lastTick >= ${tick}`;

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

const consoleErrors = (run: string) =>
  rv(["console", "--run", run, "errors"]).pipe(
    Effect.map((text) =>
      Number(
        /^(?<count>\d+) lines from /mu.exec(text)?.groups?.count ?? Number.NaN
      )
    )
  );

const checkoutOf = (listed: string, run: string): string | null =>
  listed
    .split("\n")
    .find((line) => line.includes(` run ${run} `))
    ?.split(" from ")
    .at(-1) ?? null;

const checkedSides = Effect.fnUntraced(function* checkedSides(
  options: GpuOptions,
  revision: string
) {
  const listed = yield* rv(["list"]);
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

const sampleOnce = Effect.fnUntraced(function* sampleOnce(
  dir: string,
  run: string,
  where: Pick<GpuSample, "pair" | "position" | "side">,
  scenario: Scenario
) {
  const fs = yield* FileSystem.FileSystem;
  const errorsBefore = yield* consoleErrors(run);
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
  const installed = yield* rv(["js", "--run", run, INSTALL]).pipe(
    Effect.flatMap(decodeInstalled),
    Effect.mapError(failed(`long-task observer on ${run}`))
  );
  yield* rv([
    "wait",
    "--run",
    run,
    reached(scenario.window.to),
    "--timeout",
    String(WINDOW_TIMEOUT_S),
  ]);
  const text = yield* rv(["js", "--run", run, collect(scenario, where.side)]);
  const errorsAfter = yield* consoleErrors(run);
  yield* rv(["open", "--run", run, PARK]);
  const file = `${scenario.id}-pair${where.pair}-${where.side}.json`;
  yield* fs.writeFileString(path.join(dir, "gpu", file), text);
  const fields = {
    consoleErrors: errorsAfter - errorsBefore,
    file,
    installed,
    pair: where.pair,
    position: where.position,
    run,
    scenario: scenario.id,
  };
  const notCapture = failed(`${file} is not a frame capture`);
  const sample: GpuSample =
    where.side === "A"
      ? {
          ...fields,
          capture: yield* decodeCapture(text).pipe(Effect.mapError(notCapture)),
          side: "A",
        }
      : {
          ...fields,
          capture: yield* decodeRaced(text).pipe(Effect.mapError(notCapture)),
          side: "B",
        };
  return sample;
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
  const startedAt = yield* Clock.currentTimeMillis;
  const approved = yield* readBudgets(options.budgets);
  const revision = yield* revisionOf(
    REPO_ROOT,
    options.ref ?? approved.budgets.baseline.revision
  );
  const sides = yield* checkedSides(options, revision);
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
  const display = yield* processes.run("system_profiler", [
    "SPDisplaysDataType",
  ]);
  const page = {
    A: yield* rv(["open", "--run", options.runs.A, PARK]).pipe(
      Effect.andThen(rv(["js", "--run", options.runs.A, PREPARE])),
      Effect.flatMap(decodeFacts)
    ),
    B: yield* rv(["open", "--run", options.runs.B, PARK]).pipe(
      Effect.andThen(rv(["js", "--run", options.runs.B, PREPARE])),
      Effect.flatMap(decodeFacts)
    ),
  };
  yield* say(`display A ${JSON.stringify(page.A)} B ${JSON.stringify(page.B)}`);
  if (
    page.A.width !== page.B.width ||
    page.A.height !== page.B.height ||
    page.A.dpr !== page.B.dpr
  ) {
    return {
      code: 1,
      lines: [
        `FAIL viewport A=${page.A.width}x${page.A.height}@${page.A.dpr} B=${page.B.width}x${page.B.height}@${page.B.dpr}: restart the run whose window was resized`,
        `evidence ${dir}`,
      ],
    };
  }
  yield* warm(options.runs.A);
  yield* warm(options.runs.B);
  const samples: GpuSample[] = [];
  for (let pair = 0; pair < GPU_PAIRS; pair += 1) {
    for (const [index, scenario] of scenarios.entries()) {
      const order: readonly SideName[] =
        (pair + index) % 2 === 0 ? ["A", "B"] : ["B", "A"];
      for (const [position, side] of order.entries()) {
        const sample = yield* sampleOnce(
          dir,
          options.runs[side],
          { pair, position, side },
          scenario
        );
        samples.push(sample);
        yield* fs.writeFileString(
          path.join(dir, "samples.json"),
          JSON.stringify(samples)
        );
        yield* say(`gpu ${scenario.id} pair ${pair} ${side} captured`);
      }
    }
  }
  const after = yield* doctorAll(options, dir, "doctor-after");
  const evaluation = evaluateGpu(samples, approved.budgets.limits);
  const files = yield* Effect.all(
    samples.map((sample) =>
      fs
        .readFileString(path.join(dir, "gpu", sample.file))
        .pipe(
          Effect.map((text) => ({ file: sample.file, sha256: sha256Of(text) }))
        )
    )
  );
  const lines = [...after, ...evaluation.lines];
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
        comparisonId,
        counts: evaluation.counts,
        display: {
          frameRate: FRAME_RATE,
          page,
          systemProfiler: display.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) =>
              /^(?:Chipset Model|Display Type|Resolution|UI Looks like|Main Display|Refresh)/u.test(
                line
              )
            ),
        },
        environment: GPU_ENVIRONMENT,
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
