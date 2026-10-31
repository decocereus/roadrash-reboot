import { readFileSync } from "node:fs";
import process from "node:process";

import { extensionOf, Manifest } from "@racer/art/manifest";
import * as Schema from "effect/Schema";

import { repositoryFiles } from "./git-files.ts";

const binaryArt = [
  "avif",
  "basis",
  "blend",
  "exr",
  "fbx",
  "flac",
  "gif",
  "glb",
  "gltf",
  "hdr",
  "jpeg",
  "jpg",
  "ktx2",
  "m4a",
  "mp3",
  "mp4",
  "obj",
  "ogg",
  "otf",
  "png",
  "ttf",
  "wav",
  "webm",
  "webp",
  "woff",
  "woff2",
] as const;

const MANIFEST = "apps/web/src/assets/art.json";
const isManifest = Schema.is(Manifest);

const committed = repositoryFiles(
  ".",
  binaryArt.map((extension) => `*.${extension}`)
).filter((file) => !file.startsWith("docs/"));

const manifest: unknown = JSON.parse(readFileSync(MANIFEST, "utf-8"));
const entries = isManifest(manifest) ? Object.entries(manifest) : [];
const malformed = [
  ...(isManifest(manifest)
    ? []
    : [
        `${MANIFEST} maps art names to content-addressed keys; stage art with pnpm art:stage`,
      ]),
  ...entries.flatMap(([name, key]) =>
    extensionOf(name) === extensionOf(key)
      ? []
      : [`${MANIFEST}: ${name} -> ${key} changes the file's extension`]
  ),
];

const problems = [
  ...committed.map(
    (file) =>
      `${file}: game art is not committed; stage it with pnpm art:stage, upload it with pnpm art:upload and load it through ${MANIFEST}`
  ),
  ...(entries.length === 0 ? [`${MANIFEST} lists no art`] : []),
  ...malformed,
];

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `Art: ok (${entries.length} manifest entries, no committed game binaries)\n`
);
