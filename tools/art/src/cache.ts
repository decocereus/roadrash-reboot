import os from "node:os";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";

import { ArtRejected } from "./art-rejected.ts";
import { holdsKey } from "./manifest.ts";
import type { ArtManifest } from "./manifest.ts";
import { artOrigin } from "./remote.ts";

export const cacheDirectory = path.join(os.homedir(), ".cache/rushline/art");

export const cachedFile = (key: string): string =>
  path.join(cacheDirectory, key);

export const keep = Effect.fn("art.keep")(function* keep(
  key: string,
  bytes: Uint8Array
) {
  if (!holdsKey(key, bytes)) {
    return yield* new ArtRejected({
      message: `The bytes for ${key} do not hash to its key.`,
    });
  }
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(cacheDirectory, { recursive: true });
  const partial = `${cachedFile(key)}.${process.pid}.partial`;
  yield* fs.writeFile(partial, bytes);
  yield* fs.rename(partial, cachedFile(key));
  return cachedFile(key);
});

const download = Effect.fn("art.download")(function* download(key: string) {
  const url = `${artOrigin}/art/${key}`;
  const response = yield* HttpClient.get(url).pipe(
    Effect.mapError(
      (cause) => new ArtRejected({ cause, message: `Could not reach ${url}.` })
    )
  );
  if (response.status !== 200) {
    return yield* new ArtRejected({
      message: `${url} answered ${response.status}. If this art is new, stage it and run pnpm art:upload.`,
    });
  }
  const bytes = new Uint8Array(
    yield* response.arrayBuffer.pipe(
      Effect.mapError(
        (cause) => new ArtRejected({ cause, message: `Could not read ${url}.` })
      )
    )
  );
  yield* keep(key, bytes);
  return bytes;
});

export const artBytes = Effect.fn("art.bytes")(function* artBytes(key: string) {
  const fs = yield* FileSystem.FileSystem;
  if (yield* fs.exists(cachedFile(key))) {
    return yield* fs.readFile(cachedFile(key));
  }
  return yield* download(key);
});

const DOWNLOADS_AT_ONCE = 8;

export const pullAll = Effect.fn("art.pullAll")(function* pullAll(
  manifest: ArtManifest
) {
  const fs = yield* FileSystem.FileSystem;
  const keys = [...new Set(Object.values(manifest))];
  const held = yield* Effect.all(keys.map((key) => fs.exists(cachedFile(key))));
  const missing = keys.filter((_, index) => held[index] !== true);
  yield* Effect.all(missing.map(download), {
    concurrency: DOWNLOADS_AT_ONCE,
  });
  return { cached: keys.length - missing.length, downloaded: missing.length };
});
