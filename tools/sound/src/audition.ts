import path from "node:path";
import { parseArgs } from "node:util";

import { released } from "@racer/devtools/cleanup";
import { UsageError } from "@racer/devtools/usage-error";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as esbuild from "esbuild";
import { chromium, webkit } from "playwright";
import type { BrowserType } from "playwright";

import { brighterThan, measure, problemsOf, wavOf } from "./analysis.ts";
import type { Measure } from "./analysis.ts";
import { AuditionFailed } from "./audition-failed.ts";
import { pageOf } from "./page.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const ENTRY = path.join(REPO_ROOT, "apps/web/test/sound-bundle.ts");
const DEFAULT_OUT = path.join(REPO_ROOT, "tools/sound/results");
const ORIGIN = "https://audition.lowside.test";
const BUNDLE_URL = `${ORIGIN}/sound.js`;
const PAGE_HTML = "<!doctype html><title>Lowside audition</title>";

const engineNames = ["chromium", "webkit"] as const;

type EngineName = (typeof engineNames)[number];

const isEngineName = Schema.is(Schema.Literals(engineNames));

const launcherOf = (name: EngineName): BrowserType => {
  switch (name) {
    case "chromium": {
      return chromium;
    }
    case "webkit": {
      return webkit;
    }
    default: {
      return name satisfies never;
    }
  }
};

const ClipRecord = Schema.Struct({
  group: Schema.Literals(["cue", "engine", "scene"]),
  name: Schema.String,
  problems: Schema.Array(Schema.String),
  sampleRate: Schema.Number,
  samples: Schema.String,
});

export type Clip = Schema.Schema.Type<typeof ClipRecord>;

const decodeClips = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Array(ClipRecord))
);

const BRIGHTER: readonly (readonly [string, string])[] = [
  ["back", "press"],
  ["heavyweight-redline", "middleweight-redline"],
  ["middleweight-redline", "featherweight-redline"],
  ["heavyweight-idle", "featherweight-idle"],
];

const USAGE = `Usage:
  node tools/sound/audition.ts [--engine chromium|webkit] [--out <dir>]
Renders every sound offline, writes a WAV per sound and an audition page, and fails on a clipped, silent or wrongly ordered sound.`;

interface Options {
  readonly engine: EngineName;
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
          engine: { default: "chromium", type: "string" },
          out: { default: DEFAULT_OUT, type: "string" },
        },
      }),
  }).pipe(
    Effect.flatMap(({ values }): Effect.Effect<Options, UsageError> =>
      isEngineName(values.engine)
        ? Effect.succeed({ engine: values.engine, out: values.out })
        : Effect.fail(usage(`No engine is called ${values.engine}.`))
    )
  );

const failed = (message: string) => (cause: unknown) =>
  new AuditionFailed({ cause, message });

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
      ? Effect.fail(new AuditionFailed({ message: "esbuild wrote no bundle." }))
      : Effect.succeed(file.text);
  })
);

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

const renderIn = Effect.fnUntraced(function* renderIn(
  engine: EngineName,
  bundle: string
) {
  const browser = yield* browserFor(engine);
  const text = yield* Effect.tryPromise({
    catch: failed(`${engine} could not render the sounds`),
    try: async () => {
      const opened = await browser.newContext();
      const page = await opened.newPage();
      await page.route(`${ORIGIN}/**`, async (route) => {
        const wanted = route.request().url() === BUNDLE_URL;
        await route.fulfill({
          body: wanted ? bundle : PAGE_HTML,
          contentType: wanted ? "text/javascript" : "text/html",
        });
      });
      await page.goto(`${ORIGIN}/`);
      return await page.evaluate<string>(
        `import(${JSON.stringify(BUNDLE_URL)}).then((sound) => sound.renderClips())`
      );
    },
  });
  return yield* decodeClips(text).pipe(
    Effect.mapError(failed(`${engine} replied with no clips`))
  );
});

const samplesOf = (clip: Clip): Float32Array => {
  const bytes = Buffer.from(clip.samples, "base64");
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
};

const auditionAll = Effect.fnUntraced(function* auditionAll(options: Options) {
  const fs = yield* FileSystem.FileSystem;
  const bundle = yield* buildBundle;
  const clips = yield* Effect.scoped(renderIn(options.engine, bundle));
  const out = path.join(options.out, options.engine);
  yield* fs
    .makeDirectory(out, { recursive: true })
    .pipe(Effect.mapError(failed(`Could not make ${out}`)));
  const measures: Measure[] = [];
  for (const clip of clips) {
    const samples = samplesOf(clip);
    measures.push(measure(clip.name, samples, clip.sampleRate));
    const file = path.join(out, `${clip.name}.wav`);
    yield* fs
      .writeFile(file, wavOf(samples, clip.sampleRate))
      .pipe(Effect.mapError(failed(`Could not write ${file}`)));
  }
  const page = path.join(out, "index.html");
  yield* fs
    .writeFileString(page, pageOf(clips, measures, options.engine))
    .pipe(Effect.mapError(failed(`Could not write ${page}`)));
  const sceneNames = new Set(
    clips.filter((clip) => clip.group === "scene").map((clip) => clip.name)
  );
  const problems = [
    ...problemsOf(measures.filter((each) => !sceneNames.has(each.name))),
    ...brighterThan(measures, BRIGHTER),
    ...clips.flatMap((clip) => clip.problems),
  ];
  const lines = [
    ...measures.map(
      (each) =>
        `${each.name.padEnd(24)} ${each.seconds.toFixed(2)}s peak ${each.peakDb.toFixed(1)} dBFS rms ${each.rmsDb.toFixed(1)} dBFS centroid ${Math.round(each.centroid)} Hz`
    ),
    `audition page: ${page}`,
  ];
  return problems.length === 0
    ? { code: 0, lines: [...lines, "Every sound is in range."] }
    : { code: 1, lines: [...lines, ...problems] };
});

export const main = (args: readonly string[]) =>
  readOptions(args).pipe(
    Effect.flatMap(auditionAll),
    Effect.catchTags({
      AuditionFailed: (broken: AuditionFailed) =>
        Effect.succeed({ code: 2, lines: [`AUDITION ${broken.message}`] }),
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
