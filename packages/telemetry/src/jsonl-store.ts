import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

import { decodeStoredLineEffect } from "./schema.ts";
import type { Batch } from "./schema.ts";
import { TelemetryStoreError } from "./store-error.ts";
import { TelemetryStore } from "./store.ts";

export const jsonlStoreLayer = (
  directory: string
): Layer.Layer<TelemetryStore, never, FileSystem.FileSystem | Path.Path> => {
  const known = new Map<string, Set<number>>();
  const gate = Semaphore.makeUnsafe(1);

  return Layer.effect(TelemetryStore)(
    Effect.gen(function* makeJsonlStore() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const readIds = Effect.fn("telemetry.store.readIds")(function* readIds(
        file: string
      ) {
        const text = yield* fs.readFileString(file, "utf-8").pipe(
          Effect.catchReason("PlatformError", "NotFound", () =>
            Effect.succeed("")
          ),
          Effect.mapError(
            (cause) =>
              new TelemetryStoreError({ cause, operation: "read", path: file })
          )
        );
        const ids = new Set<number>();
        for (const [index, line] of text.split("\n").entries()) {
          if (line.trim() !== "") {
            const stored = yield* decodeStoredLineEffect(line).pipe(
              Effect.mapError(
                (cause) =>
                  new TelemetryStoreError({
                    cause,
                    line: index + 1,
                    operation: "decode",
                    path: file,
                  })
              )
            );
            ids.add(stored.batch.batchId);
          }
        }
        return ids;
      });

      const append = (
        file: string,
        line: string,
        ids: Set<number>,
        id: number
      ) =>
        fs.writeFileString(file, `${line}\n`, { flag: "a" }).pipe(
          Effect.mapError(
            (cause) =>
              new TelemetryStoreError({
                cause,
                operation: "append",
                path: file,
              })
          ),
          Effect.andThen(
            Effect.sync(() => {
              ids.add(id);
            })
          ),
          Effect.uninterruptible
        );

      const save = Effect.fn("telemetry.store.save")(
        function* save(batch: Batch, line: string) {
          const { sessionId } = batch.session;
          const file = path.join(directory, `${sessionId}.jsonl`);
          const ids = known.get(sessionId) ?? (yield* readIds(file));
          known.set(sessionId, ids);
          if (ids.has(batch.batchId)) {
            return "duplicate";
          }
          yield* fs.makeDirectory(directory, { recursive: true }).pipe(
            Effect.mapError(
              (cause) =>
                new TelemetryStoreError({
                  cause,
                  operation: "mkdir",
                  path: directory,
                })
            )
          );
          yield* append(file, line, ids, batch.batchId);
          return "saved";
        },
        (saving) => gate.withPermit(saving)
      );

      return TelemetryStore.of({ save });
    })
  );
};
