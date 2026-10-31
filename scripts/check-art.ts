import { readFileSync } from "node:fs";
import process from "node:process";

import { extensionOf, parseManifest } from "@racer/art/manifest";
import * as Option from "effect/Option";

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

const committed = repositoryFiles(
  ".",
  binaryArt.map((extension) => `*.${extension}`)
).filter((file) => !file.startsWith("docs/"));

const manifest = parseManifest(JSON.parse(readFileSync(MANIFEST, "utf-8")));
const entries = Option.isSome(manifest) ? Object.entries(manifest.value) : [];
const malformed = [
  ...(Option.isSome(manifest)
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
