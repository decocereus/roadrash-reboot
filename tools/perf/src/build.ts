import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { released } from "@racer/devtools/cleanup";
import { ToolProcesses } from "@racer/devtools/process";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import type { Observation } from "./budgets.ts";
import { MeasurementFailed } from "./measurement-failed.ts";
import type { Side } from "./sides.ts";

const GZIP_LEVEL = 9;
const GAME_ENTRIES = ["src/game/game.ts", "src/asset-runtime.ts"];
const UPLOADER_ENTRY = "src/diagnostics/uploader-runtime.ts";
const START_MANIFEST = "tanstack-start-manifest:v";
const MODELS = "apps/web/src/game/models";

export const glbNames = [
  "bike",
  "car",
  "ghost",
  "oni",
  "rider_a",
  "rider_b",
  "rider_c",
  "seraph",
  "van",
] as const;

export type GlbName = (typeof glbNames)[number];

const manifestChunk = Schema.Struct({
  assets: Schema.optionalKey(Schema.Array(Schema.String)),
  css: Schema.optionalKey(Schema.Array(Schema.String)),
  dynamicImports: Schema.optionalKey(Schema.Array(Schema.String)),
  file: Schema.String,
  imports: Schema.optionalKey(Schema.Array(Schema.String)),
  isEntry: Schema.optionalKey(Schema.Boolean),
  src: Schema.optionalKey(Schema.String),
});

type ViteManifest = Readonly<Record<string, typeof manifestChunk.Type>>;

const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, manifestChunk))
);

type StartManifestBuilder = () => object;

const decodeStartModule = Schema.decodeUnknownEffect(
  Schema.Struct({
    tsrStartManifest: Schema.declare((input): input is StartManifestBuilder =>
      Predicate.isFunction(input)
    ),
  })
);

const decodeStartRoutes = Schema.decodeUnknownEffect(
  Schema.Struct({
    routes: Schema.Record(
      Schema.String,
      Schema.Struct({
        preloads: Schema.optionalKey(Schema.Array(Schema.String)),
      })
    ),
  })
);

const payload = Schema.Struct({
  file: Schema.String,
  gzip: Schema.Number,
  raw: Schema.Number,
  sha256: Schema.String,
});

type Payload = typeof payload.Type;

const closureCost = Schema.Struct({
  files: Schema.Array(Schema.String),
  gzip: Schema.Number,
  raw: Schema.Number,
});

type ClosureCost = typeof closureCost.Type;

const glbRecord = Schema.Struct({
  emitted: Schema.NullOr(Schema.String),
  emittedSha256: Schema.NullOr(Schema.String),
  name: Schema.String,
  raw: Schema.Number,
  sha256: Schema.String,
});

type GlbRecord = typeof glbRecord.Type;

export const buildRecord = Schema.Struct({
  artifactDigest: Schema.String,
  closures: Schema.Struct({
    client: closureCost,
    game: closureCost,
    gameIncremental: closureCost,
    kit: closureCost,
    root: closureCost,
    uploaderIncremental: closureCost,
    worker: closureCost,
  }),
  durationMs: Schema.Number,
  glb: Schema.Array(glbRecord),
  payloads: Schema.Array(payload),
  problems: Schema.Array(Schema.String),
  side: Schema.Literals(["A", "B"]),
});

export type BuildRecord = typeof buildRecord.Type;

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const invalid = (message: string) => (cause: unknown) =>
  new MeasurementFailed({ cause, lane: "build", message });

interface WalkRule {
  readonly attached: boolean;
  readonly dynamic: boolean;
}

const routeWalk: WalkRule = { attached: true, dynamic: false };
const workerWalk: WalkRule = { attached: false, dynamic: true };

const walk = (
  manifest: ViteManifest,
  keys: readonly string[],
  rule: WalkRule
) => {
  const files = new Set<string>();
  const missing: string[] = [];
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) {
      missing.push(key);
      return;
    }
    files.add(chunk.file);
    if (rule.attached) {
      for (const file of [...(chunk.css ?? []), ...(chunk.assets ?? [])]) {
        files.add(file);
      }
    }
    for (const next of [
      ...(chunk.imports ?? []),
      ...(rule.dynamic ? (chunk.dynamicImports ?? []) : []),
    ]) {
      visit(next);
    }
  };
  for (const key of keys) {
    visit(key);
  }
  return { files: [...files].toSorted(), missing };
};

const keyBySource = (manifest: ViteManifest, source: string): string[] =>
  Object.entries(manifest)
    .filter(([key, chunk]) => key === source || chunk.src === source)
    .map(([key]) => key);

const keyByFile = (manifest: ViteManifest, file: string): string[] =>
  Object.entries(manifest)
    .filter(([, chunk]) => chunk.file === file)
    .map(([key]) => key);

const costOf = (
  files: readonly string[],
  payloads: ReadonlyMap<string, Payload>
): ClosureCost => ({
  files,
  gzip: files.reduce((sum, file) => sum + (payloads.get(file)?.gzip ?? 0), 0),
  raw: files.reduce((sum, file) => sum + (payloads.get(file)?.raw ?? 0), 0),
});

const payloadsUnder = Effect.fnUntraced(function* payloadsUnder(
  dir: string,
  prefix: string
) {
  const fs = yield* FileSystem.FileSystem;
  const listed = yield* fs.readDirectory(dir, { recursive: true });
  const payloads: Payload[] = [];
  for (const entry of listed.toSorted()) {
    const at = path.join(dir, entry);
    const info = yield* fs.stat(at);
    const relative = entry.split(path.sep).join("/");
    if (
      info.type === "File" &&
      !relative.startsWith(".vite/") &&
      !relative.endsWith(".map")
    ) {
      const bytes = yield* fs.readFile(at);
      payloads.push({
        file: `${prefix}${relative}`,
        gzip: gzipSync(bytes, { level: GZIP_LEVEL }).length,
        raw: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }
  return payloads;
});

const startPreloads = Effect.fnUntraced(function* startPreloads(
  out: string,
  server: ViteManifest
) {
  const chunk = server[START_MANIFEST];
  if (!chunk) {
    return yield* new MeasurementFailed({
      lane: "build",
      message: "The server build has no Start route manifest.",
    });
  }
  const url = pathToFileURL(path.join(out, "server", chunk.file)).href;
  const loaded: unknown = yield* Effect.tryPromise({
    catch: invalid(`Could not load the Start route manifest ${chunk.file}.`),
    try: async () => {
      const imported: unknown = await import(url);
      return imported;
    },
  });
  const startModule = yield* decodeStartModule(loaded).pipe(
    Effect.mapError(invalid("The Start route manifest exports no function."))
  );
  const produced = yield* Effect.try({
    catch: invalid("The Start route manifest function threw."),
    try: () => startModule.tsrStartManifest(),
  });
  const { routes } = yield* decodeStartRoutes(produced).pipe(
    Effect.mapError(invalid("The Start route manifest has no routes."))
  );
  const preloadsOf = (route: string): string[] | null => {
    const preloads = routes[route]?.preloads;
    return preloads ? preloads.map((file) => file.replace(/^\//u, "")) : null;
  };
  return {
    kit: preloadsOf("/kit"),
    root: preloadsOf("__root__"),
    slash: preloadsOf("/"),
  };
});

const glbInventory = Effect.fnUntraced(function* glbInventory(
  side: Side,
  client: ViteManifest,
  payloads: ReadonlyMap<string, Payload>
) {
  const fs = yield* FileSystem.FileSystem;
  const problems: string[] = [];
  const sourceDir = path.join(side.root, MODELS);
  const sourceNames = (yield* fs.readDirectory(sourceDir))
    .filter((file) => file.endsWith(".glb"))
    .map((file) => file.slice(0, -".glb".length))
    .toSorted();
  if (
    side.name === "B" &&
    sourceNames.join(",") !== [...glbNames].toSorted().join(",")
  ) {
    problems.push(
      `GLB inventory is ${sourceNames.join(", ")}; expected ${glbNames.join(", ")}`
    );
  }
  const records: GlbRecord[] = [];
  for (const name of sourceNames) {
    const bytes = yield* fs.readFile(path.join(sourceDir, `${name}.glb`));
    const [key] = keyBySource(
      client,
      `${MODELS.slice("apps/web/".length)}/${name}.glb`
    );
    const emitted = key === undefined ? null : (client[key]?.file ?? null);
    const emittedSha256 =
      emitted === null
        ? null
        : (payloads.get(`client/${emitted}`)?.sha256 ?? null);
    if (emittedSha256 !== sha256(bytes)) {
      problems.push(
        `GLB ${name} was not emitted unchanged (${emitted ?? "absent"})`
      );
    }
    records.push({
      emitted,
      emittedSha256,
      name,
      raw: bytes.length,
      sha256: sha256(bytes),
    });
  }
  const emittedGlbs = [...payloads.keys()].filter((file) =>
    file.endsWith(".glb")
  );
  if (emittedGlbs.length !== records.length) {
    problems.push(
      `The client build emitted ${emittedGlbs.length} GLB files for ${records.length} sources`
    );
  }
  return { problems, records };
});

export const accountBuild = Effect.fn("build.account")(function* accountBuild(
  side: Side,
  out: string,
  evidence: string,
  durationMs: number
) {
  const fs = yield* FileSystem.FileSystem;
  const client = yield* fs
    .readFileString(path.join(out, "client/.vite/manifest.json"))
    .pipe(
      Effect.flatMap(decodeManifest),
      Effect.mapError(invalid("No client manifest."))
    );
  const server = yield* fs
    .readFileString(path.join(out, "server/.vite/manifest.json"))
    .pipe(
      Effect.flatMap(decodeManifest),
      Effect.mapError(invalid("No server manifest."))
    );
  const saved = path.join(evidence, `build-${side.name}`);
  yield* fs.makeDirectory(saved, { recursive: true });
  yield* fs.writeFileString(
    path.join(saved, "client-manifest.json"),
    JSON.stringify(client, null, 1)
  );
  yield* fs.writeFileString(
    path.join(saved, "server-manifest.json"),
    JSON.stringify(server, null, 1)
  );
  const payloadList = [
    ...(yield* payloadsUnder(path.join(out, "client"), "client/")),
    ...(yield* payloadsUnder(path.join(out, "server"), "server/")),
  ];
  const payloads = new Map(payloadList.map((each) => [each.file, each]));
  const start = yield* startPreloads(out, server);
  const problems: string[] = [];
  const clientKeys = (files: readonly string[] | null, route: string) => {
    if (!files) {
      problems.push(`The Start manifest has no route ${route}`);
      return [];
    }
    return files.flatMap((file) => {
      const keys = keyByFile(client, file);
      if (keys.length === 0) {
        problems.push(
          `Route ${route} preloads ${file}, which the client build did not emit`
        );
      }
      return keys;
    });
  };
  const sourceKeys = (sources: readonly string[]) =>
    sources.flatMap((source) => {
      const keys = keyBySource(client, source);
      if (keys.length !== 1) {
        problems.push(`${source} is in ${keys.length} client chunks`);
      }
      return keys;
    });
  const stylesheets = payloadList
    .filter(
      (each) => each.file.startsWith("client/") && each.file.endsWith(".css")
    )
    .map((each) => each.file.slice("client/".length));
  const rootKeys = clientKeys(start.root, "__root__");
  const closure = (keys: readonly string[], extra: readonly string[] = []) => {
    const walked = walk(client, keys, routeWalk);
    for (const key of walked.missing) {
      problems.push(`The client manifest has no chunk ${key}`);
    }
    return [...new Set([...walked.files, ...extra])]
      .map((file) => `client/${file}`)
      .toSorted();
  };
  const root = closure(
    [...rootKeys, ...clientKeys(start.slash, "/")],
    stylesheets
  );
  const kit = closure(
    [...rootKeys, ...clientKeys(start.kit, "/kit")],
    stylesheets
  );
  const game = [
    ...new Set([...root, ...closure(sourceKeys(GAME_ENTRIES))]),
  ].toSorted();
  const uploader = closure(sourceKeys([UPLOADER_ENTRY]));
  const serverEntries = Object.entries(server).filter(
    ([, chunk]) => chunk.isEntry === true
  );
  if (serverEntries.length !== 1) {
    problems.push(`The server build has ${serverEntries.length} entries`);
  }
  const worker = walk(
    server,
    serverEntries.map(([key]) => key),
    workerWalk
  );
  for (const key of worker.missing) {
    problems.push(`The server manifest has no chunk ${key}`);
  }
  const rootSet = new Set(root);
  const glb = yield* glbInventory(side, client, payloads);
  const record: BuildRecord = {
    artifactDigest: createHash("sha256")
      .update(
        payloadList.map((each) => `${each.file}:${each.sha256}`).join("\n")
      )
      .digest("hex"),
    closures: {
      client: costOf(
        payloadList
          .filter((each) => each.file.startsWith("client/"))
          .map((each) => each.file),
        payloads
      ),
      game: costOf(game, payloads),
      gameIncremental: costOf(
        game.filter((file) => !rootSet.has(file)),
        payloads
      ),
      kit: costOf(kit, payloads),
      root: costOf(root, payloads),
      uploaderIncremental: costOf(
        uploader.filter((file) => !rootSet.has(file)),
        payloads
      ),
      worker: costOf(
        worker.files.map((file) => `server/${file}`),
        payloads
      ),
    },
    durationMs,
    glb: glb.records,
    payloads: payloadList,
    problems: [...new Set([...problems, ...glb.problems])],
    side: side.name,
  };
  return record;
});

export const buildSide = Effect.fn("build.side")(function* buildSide(
  side: Side,
  evidence: string
) {
  const fs = yield* FileSystem.FileSystem;
  const processes = yield* ToolProcesses;
  const out = yield* Effect.acquireRelease(
    fs.makeTempDirectory({ prefix: `rushline-perf-build-${side.name}-` }),
    (made) => released(fs.remove(made, { force: true, recursive: true }))
  );
  const web = path.join(side.root, "apps/web");
  const started = yield* Clock.currentTimeMillis;
  yield* processes.run(
    process.execPath,
    [
      path.join(web, "node_modules/vite/bin/vite.js"),
      "build",
      "--manifest",
      "--outDir",
      out,
    ],
    { cwd: web, env: { ...process.env, NODE_ENV: "production" } }
  );
  const durationMs = (yield* Clock.currentTimeMillis) - started;
  return yield* accountBuild(side, out, evidence, durationMs);
});

const closureMetrics = [
  ["route.root", "root"],
  ["route.kit", "kit"],
  ["game", "game"],
  ["game.incremental", "gameIncremental"],
  ["worker", "worker"],
  ["client", "client"],
] as const;

const LARGEST_SHOWN = 3;

const newFiles = (
  a: ClosureCost,
  b: ClosureCost,
  payloads: readonly Payload[]
): string => {
  const before = new Set(a.files);
  const sizes = new Map(payloads.map((each) => [each.file, each.raw]));
  return b.files
    .filter((file) => !before.has(file))
    .map((file) => ({ file, raw: sizes.get(file) ?? 0 }))
    .toSorted((left, right) => right.raw - left.raw)
    .slice(0, LARGEST_SHOWN)
    .map((each) => `${each.file}(${each.raw})`)
    .join(",");
};

const observed = (
  metric: string,
  a: number,
  b: number,
  note: string
): Observation => ({
  environment: "build",
  lane: "build",
  metric,
  note: `A=${a}${note}`,
  paired: null,
  runs: { a: [a], b: [b] },
  scenario: null,
  value: b,
});

const glbSum = (records: readonly GlbRecord[]): number =>
  records.reduce((total, each) => total + each.raw, 0);

export const buildVerdicts = (a: BuildRecord, b: BuildRecord) => {
  const failures = [
    ...a.problems.map((problem) => `FAIL bytes side=A ${problem}`),
    ...b.problems.map((problem) => `FAIL bytes side=B ${problem}`),
  ];
  const glbA = new Map(a.glb.map((each) => [each.name, each.raw]));
  const observations: Observation[] = [
    ...closureMetrics.flatMap(([metric, key]) =>
      (["raw", "gzip"] as const).map((encoding) =>
        observed(
          `bytes.${metric}.${encoding}`,
          a.closures[key][encoding],
          b.closures[key][encoding],
          ` files=${b.closures[key].files.length} new=[${newFiles(a.closures[key], b.closures[key], b.payloads)}]`
        )
      )
    ),
    ...b.glb.map((each) =>
      observed(
        `assets.glb.${each.name}`,
        glbA.get(each.name) ?? Number.NaN,
        each.raw,
        ""
      )
    ),
    observed("assets.glb.total", glbSum(a.glb), glbSum(b.glb), ""),
  ];
  return { failures, observations };
};
