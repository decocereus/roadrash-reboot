import { createHash } from "node:crypto";
import path from "node:path";

import type { Input } from "@racer/track/madrid-schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

class DownloadFailed extends TaggedErrorClass<DownloadFailed>()(
  "DownloadFailed",
  {
    cause: Schema.Defect(),
    url: Schema.String,
  }
) {}

const canonical = (file: string, bytes: Uint8Array): Uint8Array => {
  if (file === "roads") {
    return new TextEncoder().encode(
      new TextDecoder()
        .decode(bytes)
        .replace(/timeStamp="[^"]*"/u, 'timeStamp="snapshot"')
    );
  }
  return bytes;
};

const checksum = (file: string, bytes: Uint8Array): string =>
  createHash("sha256").update(canonical(file, bytes)).digest("hex");

export const acquire = Effect.fn("madrid.acquire")(function* acquire(
  cache: string,
  input: Schema.Schema.Type<typeof Input>
) {
  const fs = yield* FileSystem.FileSystem;
  const file = path.join(cache, input.file);
  const exists = yield* fs.exists(file);
  if (!exists) {
    const bytes = yield* Effect.tryPromise({
      catch: (cause) => new DownloadFailed({ cause, url: input.url }),
      try: async () => {
        const response = await fetch(input.url, {
          headers: { "User-Agent": "lowside-research" },
          signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${input.url}`);
        }
        return new Uint8Array(await response.arrayBuffer());
      },
    });
    yield* fs.writeFile(file, bytes);
  }
  const bytes = yield* fs.readFile(file);
  if (checksum(input.file, bytes) !== input.sha256) {
    return yield* Effect.fail(
      new DownloadFailed({
        cause: new Error(
          `Pinned input changed: ${input.file}. Review the upstream revision before updating inputs.json.`
        ),
        url: input.url,
      })
    );
  }
  return bytes;
});
