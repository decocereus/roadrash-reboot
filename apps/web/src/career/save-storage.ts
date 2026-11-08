import * as Effect from "effect/Effect";

import { SaveStorageFailed } from "./save-storage-error.ts";

export interface SaveStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

const attempt = <Value>(
  operation: SaveStorageFailed["operation"],
  run: () => Value
) =>
  Effect.try({
    catch: (cause) => new SaveStorageFailed({ cause, operation }),
    try: run,
  });

export type SaveLocks = Pick<LockManager, "request">;

export const holdLock = (
  locks: SaveLocks,
  name: string,
  granted: (held: boolean) => void
) =>
  Effect.tryPromise({
    catch: (cause) => new SaveStorageFailed({ cause, operation: "lock" }),
    try: async (signal) => {
      await locks.request(name, { ifAvailable: true }, async (lock) => {
        granted(lock !== null);
        if (lock !== null) {
          const released = Promise.withResolvers<null>();
          signal.addEventListener("abort", () => {
            released.resolve(null);
          });
          await released.promise;
        }
      });
    },
  });

export const acquireStorage = (open: () => SaveStorage) =>
  attempt("acquire", open);

export const readItem = (storage: SaveStorage, key: string) =>
  attempt("read", () => storage.getItem(key));

export const writeItem = (
  storage: SaveStorage,
  key: string,
  text: () => string
) =>
  attempt("write", () => {
    storage.setItem(key, text());
  });

export const backUpItem = (storage: SaveStorage, key: string, text: string) =>
  attempt("backup", () => {
    storage.setItem(key, text);
  });

export const removeItem = (storage: SaveStorage, key: string) =>
  attempt("remove", () => {
    storage.removeItem(key);
  });
