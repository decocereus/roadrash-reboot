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
import type { BrowserType } from "playwright";

import { ReplayFailed } from "./replay-failed.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const ENTRY = path.join(REPO_ROOT, "apps/web/test/replay-bundle.ts");
const DEFAULT_OUT = path.join(REPO_ROOT, "tools/replay/results");
const ORIGIN = "https://replay.lowside.test";
const BUNDLE_URL = `${ORIGIN}/replay.js`;
const PAGE_HTML = "<!doctype html><title>Lowside replay</title>";
const RESTORE_AT = 2880;
const RESTORE_TICKS = 600;
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
  window: Schema.String,
});

const EngineReply = Schema.Struct({
  restored: Schema.Array(Schema.String),
  runs: Schema.Array(CaseRun),
});

const decodeReply = Schema.decodeUnknownEffect(
  Schema.fromJsonString(EngineReply)
);

const USAGE = `Usage:
  node tools/replay/engines.ts [--ticks <count>] [--engine chromium|firefox|webkit] [--out <dir>]
Each --engine may be repeated. With none, every engine runs.`;

interface Options {
  readonly engines: readonly EngineName[];
  readonly out: string;
  readonly ticks: number;
}

const usage = (message: string) =>
  new UsageError({ message: `${message}\n${USAGE}` });

const DEFAULT_TICKS = 7200;

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) =>
      usage(cause instanceof Error ? cause.message : String(cause)),
    try: () =>
      parseArgs({
        args: args[0] === "--" ? args.slice(1) : [...args],
        options: {
          engine: { multiple: true, type: "string" },
          out: { default: DEFAULT_OUT, type: "string" },
          ticks: { default: String(DEFAULT_TICKS), type: "string" },
        },
      }),
  }).pipe(
    Effect.flatMap(({ values }): Effect.Effect<Options, UsageError> => {
      const asked = values.engine ?? [];
      const unknown = asked.filter((name) => !isEngineName(name));
      const ticks = Number(values.ticks);
      if (unknown.length > 0) {
        return Effect.fail(usage(`No engine is called ${unknown.join(", ")}.`));
      }
      if (!(Number.isSafeInteger(ticks) && ticks > 0)) {
        return Effect.fail(usage("Pass a whole number of ticks above zero."));
      }
      return Effect.succeed({
        engines: asked.filter(isEngineName),
        out: values.out,
        ticks,
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

const replayScript = (bundle: string, ticks: number) =>
  `(async () => {
  const replay = await import(${JSON.stringify(bundle)});
  const runs = replay.caseIds.map((id) => ({ id, ...replay.runCase(id, ${ticks}) }));
  const last = runs[runs.length - 1];
  const restored = replay.runRestored(last.id, ${RESTORE_AT}, ${RESTORE_TICKS});
  return JSON.stringify({ restored, runs });
})()`;

const nodeReply = Effect.fnUntraced(function* nodeReply(
  out: string,
  ticks: number
) {
  const fs = yield* FileSystem.FileSystem;
  const url = pathToFileURL(ENTRY).href;
  const script = path.join(out, "replay-node.mjs");
  yield* fs
    .writeFileString(
      script,
      `process.stdout.write(await ${replayScript(url, ticks)});\n`
    )
    .pipe(Effect.mapError(failed(`Could not write ${script}`)));
  const output = yield* ToolProcesses.use((processes) =>
    processes.run(process.execPath, [script])
  ).pipe(Effect.mapError(failed("Node could not replay the cases")));
  return yield* decodeReply(output.stdout).pipe(
    Effect.mapError(failed("Node replied with no replay runs"))
  );
});

const engineReply = Effect.fnUntraced(function* engineReply(
  engine: EngineName,
  bundle: string,
  ticks: number
) {
  const browser = yield* Effect.acquireRelease(
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
  const page = yield* Effect.tryPromise({
    catch: failed(`${engine} would not open a page`),
    try: async () => await browser.newPage(),
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
  const replied = yield* Effect.tryPromise({
    catch: failed(`${engine} could not replay the cases`),
    try: async () =>
      await page.evaluate<string>(replayScript(BUNDLE_URL, ticks)),
  });
  return yield* decodeReply(replied).pipe(
    Effect.mapError(failed(`${engine} replied with no replay runs`))
  );
});

const firstDifference = (
  frames: readonly string[],
  reference: readonly string[]
) => {
  const at = frames.findIndex((frame, tick) => frame !== reference[tick]);
  return at === -1 ? null : at + 1;
};

const divergences = (
  engine: EngineName,
  reply: Schema.Schema.Type<typeof EngineReply>,
  reference: Schema.Schema.Type<typeof EngineReply>
): readonly string[] => {
  const known = new Map(reference.runs.map((run) => [run.id, run]));
  const lines = reply.runs.flatMap((run): readonly string[] => {
    const same = known.get(run.id);
    if (same === undefined) {
      return [`${engine} replayed ${run.id}, which Node did not.`];
    }
    const tick = firstDifference(run.frames, same.frames);
    if (tick !== null) {
      return [
        `${engine} and Node first differ in ${run.id} at tick ${tick}: ${run.frames[tick - 1]} against ${same.frames[tick - 1]}.`,
      ];
    }
    return [
      ...(run.full === same.full
        ? []
        : [`${engine} hashes ${run.id} to ${run.full}, Node to ${same.full}.`]),
      ...(run.window === same.window
        ? []
        : [`${engine} hashes the window of ${run.id} differently from Node.`]),
    ];
  });
  const restored = firstDifference(reply.restored, reference.restored);
  return [
    ...lines,
    ...(restored === null
      ? []
      : [
          `${engine} first differs from Node at tick ${restored} of the restored race.`,
        ]),
  ];
};

const seconds = (from: number, to: number) =>
  ((to - from) / MILLISECONDS).toFixed(ONE_DECIMAL);

const replayEngine = Effect.fnUntraced(function* replayEngine(
  engine: EngineName,
  bundle: string,
  options: Options,
  reference: Schema.Schema.Type<typeof EngineReply>
) {
  const started = yield* Clock.currentTimeMillis;
  const reply = yield* Effect.scoped(
    engineReply(engine, bundle, options.ticks)
  );
  const ended = yield* Clock.currentTimeMillis;
  const problems = divergences(engine, reply, reference);
  const ticks = reply.runs.length * options.ticks;
  return {
    line: `${engine}: ${reply.runs.length} replays, ${ticks} ticks, ${seconds(started, ended)}s${problems.length === 0 ? "" : " DIVERGED"}`,
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
  const reference = yield* nodeReply(options.out, options.ticks);
  const ended = yield* Clock.currentTimeMillis;
  const lines = [
    `bundle: ${bundle.length} bytes`,
    `node: ${reference.runs.length} replays, ${reference.runs.length * options.ticks} ticks, ${seconds(started, ended)}s`,
  ];
  const problems: string[] = [];
  for (const engine of options.engines) {
    const outcome = yield* replayEngine(engine, bundle, options, reference);
    lines.push(outcome.line);
    problems.push(...outcome.problems);
  }
  return problems.length === 0
    ? { code: 0, lines: [...lines, "Every engine matches Node on every tick."] }
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
