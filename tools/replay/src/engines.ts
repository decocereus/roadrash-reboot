import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { released } from "@racer/devtools/cleanup";
import { ToolProcesses } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as esbuild from "esbuild";
import { chromium, firefox, webkit } from "playwright";
import type { Browser, BrowserType, Page } from "playwright";

import { ReplayFailed } from "./replay-failed.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const ENTRY = path.join(REPO_ROOT, "apps/web/test/replay-bundle.ts");
const DEFAULT_OUT = path.join(REPO_ROOT, "tools/replay/results");
const ORIGIN = "https://replay.lowside.test";
const BUNDLE_URL = `${ORIGIN}/replay.js`;
const PAGE_HTML = "<!doctype html><title>Lowside replay</title>";
const COLD_AT = 2880;
const COLD_TICKS = 600;
const MILLISECONDS = 1000;
const ONE_DECIMAL = 1;

const engineNames = ["chromium", "firefox", "webkit"] as const;

type EngineName = (typeof engineNames)[number];

const isEngineName = Schema.is(Schema.Literals(engineNames));

const launcherOf = (name: EngineName): BrowserType => {
  switch (name) {
    case "chromium": {
      return chromium;
    }
    case "firefox": {
      return firefox;
    }
    case "webkit": {
      return webkit;
    }
    default: {
      return name satisfies never;
    }
  }
};

const CaseRun = Schema.Struct({
  final: Schema.String,
  frames: Schema.Array(Schema.String),
  full: Schema.String,
  id: Schema.String,
  problems: Schema.Array(Schema.String),
  result: Schema.NullOr(Schema.String),
  ticks: Schema.Number,
  window: Schema.String,
});

type Run = Schema.Schema.Type<typeof CaseRun>;

const WarmReply = Schema.Struct({
  checkpoint: Schema.String,
  coldCase: Schema.String,
  runs: Schema.Array(CaseRun),
});

type Warm = Schema.Schema.Type<typeof WarmReply>;

const ColdReply = Schema.Array(Schema.String);

const decodeWarm = Schema.decodeUnknownEffect(Schema.fromJsonString(WarmReply));

const decodeCold = Schema.decodeUnknownEffect(Schema.fromJsonString(ColdReply));

const USAGE = `Usage:
  node tools/replay/engines.ts [--limit <ticks>] [--engine chromium|firefox|webkit] [--out <dir>]
Every case rides to its own outcome. --limit caps a case that never settles.
Each --engine may be repeated. With none, every engine runs.`;

interface Options {
  readonly engines: readonly EngineName[];
  readonly limit: number | null;
  readonly out: string;
}

const usage = (message: string) =>
  new UsageError({ message: `${message}\n${USAGE}` });

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) =>
      usage(cause instanceof Error ? cause.message : String(cause)),
    try: () =>
      parseArgs({
        args: args[0] === "--" ? args.slice(1) : [...args],
        options: {
          engine: { multiple: true, type: "string" },
          limit: { type: "string" },
          out: { default: DEFAULT_OUT, type: "string" },
        },
      }),
  }).pipe(
    Effect.flatMap(({ values }): Effect.Effect<Options, UsageError> => {
      const asked = values.engine ?? [];
      const unknown = asked.filter((name) => !isEngineName(name));
      const limit = values.limit === undefined ? null : Number(values.limit);
      if (unknown.length > 0) {
        return Effect.fail(usage(`No engine is called ${unknown.join(", ")}.`));
      }
      if (limit !== null && !(Number.isSafeInteger(limit) && limit > 0)) {
        return Effect.fail(usage("Pass a whole number of ticks above zero."));
      }
      return Effect.succeed({
        engines: asked.filter(isEngineName),
        limit,
        out: values.out,
      });
    }),
    Effect.map((options) => ({
      ...options,
      engines: options.engines.length === 0 ? engineNames : options.engines,
    }))
  );

const failed = (message: string) => (cause: unknown) =>
  new ReplayFailed({ cause, message });

const buildBundle = Effect.tryPromise({
  catch: failed(`esbuild could not bundle ${ENTRY}`),
  try: async () =>
    await esbuild.build({
      bundle: true,
      conditions: ["import"],
      entryPoints: [ENTRY],
      format: "esm",
      platform: "neutral",
      target: "es2023",
      write: false,
    }),
}).pipe(
  Effect.flatMap((built) => {
    const [file] = built.outputFiles;
    return file === undefined
      ? Effect.fail(new ReplayFailed({ message: "esbuild wrote no bundle." }))
      : Effect.succeed(file.text);
  })
);

const warmScript = (bundle: string, limit: number | null) =>
  `(async () => {
  const replay = await import(${JSON.stringify(bundle)});
  const limit = ${limit ?? "replay.TICK_LIMIT"};
  const runs = replay.caseIds.map((id) => ({ id, ...replay.runCase(id, limit) }));
  const coldCase = replay.caseIds[replay.caseIds.length - 1];
  const checkpoint = replay.checkpointAt(coldCase, ${COLD_AT});
  return JSON.stringify({ checkpoint, coldCase, runs });
})()`;

const coldScript = (bundle: string, warm: Warm) =>
  `(async () => {
  const replay = await import(${JSON.stringify(bundle)});
  const frames = replay.runCold(${JSON.stringify(warm.coldCase)}, ${JSON.stringify(warm.checkpoint)}, ${COLD_TICKS});
  return JSON.stringify(frames);
})()`;

const scriptOutput = Effect.fnUntraced(function* scriptOutput(
  out: string,
  file: string,
  script: string
) {
  const fs = yield* FileSystem.FileSystem;
  const at = path.join(out, file);
  yield* fs
    .writeFileString(at, `process.stdout.write(await ${script});\n`)
    .pipe(Effect.mapError(failed(`Could not write ${at}`)));
  const output = yield* ToolProcesses.use((processes) =>
    processes.run(process.execPath, [at])
  ).pipe(Effect.mapError(failed(`Node could not run ${file}`)));
  return output.stdout;
});

const nodeWarm = Effect.fnUntraced(function* nodeWarm(
  out: string,
  limit: number | null
) {
  const url = pathToFileURL(ENTRY).href;
  const text = yield* scriptOutput(
    out,
    "replay-node.mjs",
    warmScript(url, limit)
  );
  return yield* decodeWarm(text).pipe(
    Effect.mapError(failed("Node replied with no replay runs"))
  );
});

const nodeCold = Effect.fnUntraced(function* nodeCold(out: string, warm: Warm) {
  const url = pathToFileURL(ENTRY).href;
  const text = yield* scriptOutput(
    out,
    "replay-node-cold.mjs",
    coldScript(url, warm)
  );
  return yield* decodeCold(text).pipe(
    Effect.mapError(failed("A fresh Node process replied with no frames"))
  );
});

const browserFor = (engine: EngineName) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      catch: failed(`${engine} would not start`),
      try: async () => await launcherOf(engine).launch(),
    }),
    (open) =>
      released(
        Effect.tryPromise({
          catch: failed(`${engine} would not close`),
          try: async () => {
            await open.close();
          },
        })
      )
  );

const pageOn = Effect.fnUntraced(function* pageOn(
  engine: EngineName,
  browser: Browser,
  bundle: string
) {
  const page = yield* Effect.tryPromise({
    catch: failed(`${engine} would not open a page`),
    try: async () => {
      const context = await browser.newContext();
      return await context.newPage();
    },
  });
  yield* Effect.tryPromise({
    catch: failed(`${engine} would not serve the bundle`),
    try: async () =>
      await page.route(`${ORIGIN}/**`, async (route) => {
        const wanted = route.request().url() === BUNDLE_URL;
        await route.fulfill({
          body: wanted ? bundle : PAGE_HTML,
          contentType: wanted ? "text/javascript" : "text/html",
        });
      }),
  });
  yield* Effect.tryPromise({
    catch: failed(`${engine} would not load the page`),
    try: async () => await page.goto(`${ORIGIN}/`),
  });
  return page;
});

const evaluated = (page: Page, script: string, message: string) =>
  Effect.tryPromise({
    catch: failed(message),
    try: async () => await page.evaluate<string>(script),
  });

const engineReply = Effect.fnUntraced(function* engineReply(
  engine: EngineName,
  bundle: string,
  options: Options,
  reference: Warm
) {
  const browser = yield* browserFor(engine);
  const cold = yield* pageOn(engine, browser, bundle).pipe(
    Effect.flatMap((page) =>
      evaluated(
        page,
        coldScript(BUNDLE_URL, reference),
        `${engine} could not carry on from the checkpoint`
      )
    ),
    Effect.flatMap((text) =>
      decodeCold(text).pipe(
        Effect.mapError(failed(`${engine} replied with no restored frames`))
      )
    )
  );
  const warm = yield* pageOn(engine, browser, bundle).pipe(
    Effect.flatMap((page) =>
      evaluated(
        page,
        warmScript(BUNDLE_URL, options.limit),
        `${engine} could not replay the cases`
      )
    ),
    Effect.flatMap((text) =>
      decodeWarm(text).pipe(
        Effect.mapError(failed(`${engine} replied with no replay runs`))
      )
    )
  );
  return { cold, warm };
});

const firstDifference = (
  frames: readonly string[],
  reference: readonly string[]
): number | null => {
  const shared = Math.min(frames.length, reference.length);
  for (let tick = 0; tick < shared; tick += 1) {
    if (frames[tick] !== reference[tick]) {
      return tick + 1;
    }
  }
  return frames.length === reference.length ? null : shared + 1;
};

const frameAt = (run: Run, tick: number): string =>
  run.frames[tick - 1] ?? "no tick of its own";

const caseLines = (
  engine: string,
  run: Run,
  same: Run | undefined
): readonly string[] => {
  if (same === undefined) {
    return [`${engine} replayed ${run.id}, which Node did not.`];
  }
  const tick = firstDifference(run.frames, same.frames);
  const ended =
    run.ticks === same.ticks && run.result === same.result
      ? []
      : [
          `${engine} ended ${run.id} at tick ${run.ticks} as ${run.result}, Node at tick ${same.ticks} as ${same.result}.`,
        ];
  if (tick !== null) {
    return [
      `${engine} and Node first differ in ${run.id} at tick ${tick}: ${frameAt(run, tick)} against ${frameAt(same, tick)}.`,
      ...ended,
    ];
  }
  if (ended.length > 0) {
    return ended;
  }
  return [
    ...(run.full === same.full
      ? []
      : [`${engine} hashes ${run.id} to ${run.full}, Node to ${same.full}.`]),
    ...(run.window === same.window
      ? []
      : [`${engine} hashes the window of ${run.id} differently from Node.`]),
  ];
};

const unsettled = (where: string, runs: readonly Run[]): readonly string[] =>
  runs.flatMap((run) =>
    run.result === null ? [`${where} never settled ${run.id}.`] : []
  );

const coldLines = (
  where: string,
  cold: readonly string[],
  warm: Warm
): readonly string[] => {
  const run = warm.runs.find(({ id }) => id === warm.coldCase);
  const expected = (run?.frames ?? []).slice(COLD_AT, COLD_AT + COLD_TICKS);
  if (cold.length !== COLD_TICKS) {
    return [
      `${where} rode ${cold.length} ticks from the checkpoint, not ${COLD_TICKS}.`,
    ];
  }
  const tick = firstDifference(cold, expected);
  return tick === null
    ? []
    : [
        `${where} first differs from the race it restored at tick ${COLD_AT + tick}: ${cold[tick - 1]} against ${expected[tick - 1]}.`,
      ];
};

const divergences = (
  engine: EngineName,
  reply: { readonly cold: readonly string[]; readonly warm: Warm },
  reference: Warm
): readonly string[] => {
  const known = new Map(reference.runs.map((run) => [run.id, run]));
  return [
    ...reply.warm.runs.flatMap((run) =>
      caseLines(engine, run, known.get(run.id))
    ),
    ...reply.warm.runs.flatMap((run) => run.problems),
    ...unsettled(engine, reply.warm.runs),
    ...coldLines(`${engine} from cold`, reply.cold, reference),
  ];
};

const seconds = (from: number, to: number) =>
  ((to - from) / MILLISECONDS).toFixed(ONE_DECIMAL);

const tickCount = (runs: readonly Run[]) =>
  runs.reduce((total, run) => total + run.ticks, 0);

const replayEngine = Effect.fnUntraced(function* replayEngine(
  engine: EngineName,
  bundle: string,
  options: Options,
  reference: Warm
) {
  const started = yield* Clock.currentTimeMillis;
  const reply = yield* Effect.scoped(
    engineReply(engine, bundle, options, reference)
  );
  const ended = yield* Clock.currentTimeMillis;
  const problems = divergences(engine, reply, reference);
  return {
    line: `${engine}: ${reply.warm.runs.length} replays, ${tickCount(reply.warm.runs)} ticks, ${seconds(started, ended)}s${problems.length === 0 ? "" : " DIVERGED"}`,
    problems,
  };
});

const replayAll = Effect.fnUntraced(function* replayAll(options: Options) {
  const fs = yield* FileSystem.FileSystem;
  const bundle = yield* buildBundle;
  yield* fs
    .makeDirectory(options.out, { recursive: true })
    .pipe(Effect.mapError(failed(`Could not make ${options.out}`)));
  const bundlePath = path.join(options.out, "replay.js");
  yield* fs
    .writeFileString(bundlePath, bundle)
    .pipe(Effect.mapError(failed(`Could not write ${bundlePath}`)));
  const started = yield* Clock.currentTimeMillis;
  const reference = yield* nodeWarm(options.out, options.limit);
  const ended = yield* Clock.currentTimeMillis;
  const cold = yield* nodeCold(options.out, reference);
  const lines = [
    `bundle: ${bundle.length} bytes`,
    `node: ${reference.runs.length} replays, ${tickCount([...reference.runs])} ticks, ${seconds(started, ended)}s`,
  ];
  const problems: string[] = [
    ...reference.runs.flatMap((run) => run.problems),
    ...unsettled("node", [...reference.runs]),
    ...coldLines("a fresh node process", cold, reference),
  ];
  for (const engine of options.engines) {
    const outcome = yield* replayEngine(engine, bundle, options, reference);
    lines.push(outcome.line);
    problems.push(...outcome.problems);
  }
  return problems.length === 0
    ? {
        code: 0,
        lines: [
          ...lines,
          "Every engine matches Node on every tick, to every outcome.",
        ],
      }
    : { code: 1, lines: [...lines, ...problems] };
});

export const main = (args: readonly string[]) =>
  readOptions(args).pipe(
    Effect.flatMap(replayAll),
    Effect.catchTags({
      ReplayFailed: (broken: ReplayFailed) =>
        Effect.succeed({ code: 2, lines: [`REPLAY ${broken.message}`] }),
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
