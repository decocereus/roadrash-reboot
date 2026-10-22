import { createHash } from "node:crypto";
import path from "node:path";

import { released } from "@racer/devtools/cleanup";
import { ToolProcesses } from "@racer/devtools/process";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { ConfigInvalid } from "./config-invalid.ts";

export type SideName = "A" | "B";

export interface Side {
  readonly name: SideName;
  readonly root: string;
  readonly revision: string;
  readonly dirty: boolean;
  readonly sourceDigest: string;
  readonly sourceFiles: number;
}

export const sideIdentity = Schema.Struct({
  dirty: Schema.Boolean,
  harnessDigest: Schema.String,
  revision: Schema.String,
  sourceDigest: Schema.String,
  sourceFiles: Schema.Number,
});

type SideIdentity = typeof sideIdentity.Type;

const SOURCE_PATHS = [
  "apps",
  "packages",
  "tools",
  "scripts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
];

const HARNESS_PATHS = ["tools/perf/gate.ts", "tools/perf/node.ts"];

const HARNESS_DIRECTORY = "tools/perf/src";

const CLONE_PARENT = "/tmp";

const git = (root: string, args: readonly string[]) =>
  ToolProcesses.use((processes) =>
    processes.run("git", ["-C", root, ...args])
  ).pipe(Effect.map((output) => output.stdout.trim()));

const filesDigest = Effect.fnUntraced(function* filesDigest(
  root: string,
  files: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const hash = createHash("sha256");
  let counted = 0;
  for (const file of files.toSorted()) {
    const at = path.join(root, file);
    if (yield* fs.exists(at)) {
      const bytes = yield* fs.readFile(at);
      hash.update(`${file}\0`);
      hash.update(createHash("sha256").update(bytes).digest("hex"));
      hash.update("\0");
      counted += 1;
    }
  }
  return { digest: hash.digest("hex"), files: counted };
});

const listed = (text: string): string[] =>
  text.split("\n").filter((line) => line !== "");

const describe = Effect.fnUntraced(function* describe(
  name: SideName,
  root: string
) {
  const revision = yield* git(root, ["rev-parse", "HEAD"]);
  const status = yield* git(root, [
    "status",
    "--porcelain",
    "--",
    ...SOURCE_PATHS,
  ]);
  const files = listed(
    yield* git(root, [
      "ls-files",
      "-co",
      "--exclude-standard",
      "--",
      ...SOURCE_PATHS,
    ])
  );
  const source = yield* filesDigest(root, files);
  const side: Side = {
    dirty: status !== "",
    name,
    revision,
    root,
    sourceDigest: source.digest,
    sourceFiles: source.files,
  };
  return side;
});

export const currentSide = (root: string) => describe("B", root);

export const checkoutAt = (root: string) => describe("A", root);

const harnessDigest = Effect.fnUntraced(function* harnessDigest(root: string) {
  const fs = yield* FileSystem.FileSystem;
  const sources = yield* fs.readDirectory(path.join(root, HARNESS_DIRECTORY));
  const files = [
    ...HARNESS_PATHS,
    ...sources.map((file) => path.join(HARNESS_DIRECTORY, file)),
  ];
  return (yield* filesDigest(root, files)).digest;
});

const overlayHarness = Effect.fnUntraced(function* overlayHarness(
  from: string,
  to: string
) {
  const fs = yield* FileSystem.FileSystem;
  for (const file of HARNESS_PATHS) {
    yield* fs.copyFile(path.join(from, file), path.join(to, file));
  }
  yield* fs.remove(path.join(to, HARNESS_DIRECTORY), {
    force: true,
    recursive: true,
  });
  yield* fs.copy(
    path.join(from, HARNESS_DIRECTORY),
    path.join(to, HARNESS_DIRECTORY)
  );
});

export const revisionOf = (root: string, ref: string) =>
  git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigInvalid({
          cause,
          message: `The baseline revision ${ref} is not a commit in this repository; fetch it first.`,
        })
    )
  );

const kilobytesOf = (text: string): number =>
  Number(text.split("\t")[0] ?? Number.NaN);

export const materializedSide = Effect.fn("sides.materialize")(
  function* materializedSide(current: Side, revision: string) {
    const fs = yield* FileSystem.FileSystem;
    const processes = yield* ToolProcesses;
    const parent = yield* Effect.acquireRelease(
      fs.makeTempDirectory({
        directory: CLONE_PARENT,
        prefix: "rushline-perf-a-",
      }),
      (made) => released(fs.remove(made, { force: true, recursive: true }))
    );
    const root = path.join(parent, "checkout");
    yield* processes.run("git", [
      "clone",
      "--quiet",
      "--no-hardlinks",
      "--no-checkout",
      current.root,
      root,
    ]);
    yield* git(root, ["checkout", "--quiet", "--detach", revision]);
    yield* processes.run(
      "pnpm",
      ["install", "--offline", "--frozen-lockfile", "--reporter=silent"],
      { cwd: root }
    );
    yield* overlayHarness(current.root, root);
    const side = yield* describe("A", root);
    const used = yield* processes.run("du", ["-sk", root]);
    return { diskKilobytes: kilobytesOf(used.stdout), side };
  }
);

export const identityOf = Effect.fnUntraced(function* identityOf(side: Side) {
  const identity: SideIdentity = {
    dirty: side.dirty,
    harnessDigest: yield* harnessDigest(side.root),
    revision: side.revision,
    sourceDigest: side.sourceDigest,
    sourceFiles: side.sourceFiles,
  };
  return identity;
});
