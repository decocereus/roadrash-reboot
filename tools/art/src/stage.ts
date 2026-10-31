import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { ArtRejected } from "./art-rejected.ts";
import { keep } from "./cache.ts";
import {
  ArtName,
  extensionOf,
  keyOf,
  manifestFile,
  manifestText,
  readManifest,
  repositoryRoot,
} from "./manifest.ts";

export interface StagedArt {
  readonly bytes: Uint8Array;
  readonly name: string;
}

const isArtName = Schema.is(ArtName);

export const stageArt = Effect.fn("art.stage")(function* stageArt(
  entries: readonly StagedArt[]
) {
  const fs = yield* FileSystem.FileSystem;
  const manifest = (yield* fs.exists(manifestFile))
    ? yield* readManifest()
    : {};
  const next = { ...manifest };
  const lines: string[] = [];
  for (const { bytes, name } of entries) {
    const extension = extensionOf(name);
    if (extension === null || !isArtName(name)) {
      return yield* new ArtRejected({
        message: `${name} is not an art name: lowercase path segments ending in a known extension.`,
      });
    }
    const key = keyOf(bytes, extension);
    yield* keep(key, bytes);
    lines.push(
      next[name] === key
        ? `${name}: unchanged ${key}`
        : `${name}: ${next[name] ?? "new"} -> ${key} (${bytes.length} B)`
    );
    next[name] = key;
  }
  yield* fs.writeFileString(manifestFile, manifestText(next));
  return [
    ...lines,
    `Wrote ${path.relative(repositoryRoot, manifestFile)}. Run pnpm art:upload before you push.`,
  ];
});
