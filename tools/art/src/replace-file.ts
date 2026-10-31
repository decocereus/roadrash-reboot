import { randomUUID } from "node:crypto";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

export const replaceFile = Effect.fn("art.replaceFile")(function* replaceFile(
  file: string,
  bytes: Uint8Array
) {
  const fs = yield* FileSystem.FileSystem;
  const partial = `${file}.${randomUUID()}.partial`;
  yield* fs.writeFile(partial, bytes);
  yield* fs.rename(partial, file);
});
