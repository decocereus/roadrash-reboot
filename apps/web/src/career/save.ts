import { parseCareer, serialiseCareer } from "@racer/career/save";
import type { SaveError } from "@racer/career/save-schema";
import { resumeCareer } from "@racer/career/settle";
import type { Ledger } from "@racer/career/settle";
import { newCareer } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import type { SaveStorageFailed } from "./save-storage-error.ts";
import {
  acquireStorage,
  backUpItem,
  readItem,
  removeItem,
  writeItem,
} from "./save-storage.ts";
import type { SaveStorage } from "./save-storage.ts";

export const SAVE_KEY = "rushline.career";
export const BACKUP_KEY = "rushline.career.backup";

const SEED_RANGE = 2 ** 32;

const failedStatus = {
  acquire: "unavailable",
  backup: "writeFailed",
  read: "readFailed",
  remove: "writeFailed",
  write: "writeFailed",
} as const;

export interface StorageFailure {
  readonly status: (typeof failedStatus)[SaveStorageFailed["operation"]];
  readonly failure: SaveStorageFailed;
}

type Persistence =
  | { readonly status: "unchanged" }
  | { readonly status: "saved" }
  | StorageFailure;

export type CareerLoad =
  | { readonly status: "absent" }
  | { readonly status: "corrupt"; readonly error: SaveError }
  | {
      readonly status: "ready";
      readonly career: CareerState;
      readonly leftRace: Ledger | null;
      readonly persistence: Persistence;
    }
  | StorageFailure;

export type Stored = { readonly status: "saved" } | StorageFailure;

export type Reset = { readonly status: "reset" } | StorageFailure;

export type SaveState =
  | { readonly status: "empty" }
  | {
      readonly status: "ready";
      readonly career: CareerState;
      readonly leftRace: Ledger | null;
    }
  | { readonly status: "corrupt"; readonly error: SaveError }
  | { readonly status: "loading" };

const saved = { status: "saved" } as const;

const failureOf = (failure: SaveStorageFailed): StorageFailure => ({
  failure,
  status: failedStatus[failure.operation],
});

const outcomeOf = <Outcome>(
  effect: Effect.Effect<Outcome, SaveStorageFailed>
): Outcome | StorageFailure =>
  Result.match(Effect.runSync(Effect.result(effect)), {
    onFailure: failureOf,
    onSuccess: (outcome) => outcome,
  });

const writeCareer = (storage: SaveStorage, career: CareerState) =>
  writeItem(storage, SAVE_KEY, () => serialiseCareer(career));

const resumed = Effect.fn("career.save.resume")(function* resumed(
  storage: SaveStorage,
  career: CareerState
) {
  const settlement = resumeCareer(career);
  if (!settlement.settled) {
    return {
      career,
      leftRace: null,
      persistence: { status: "unchanged" },
      status: "ready",
    } satisfies CareerLoad;
  }
  const written = yield* Effect.result(writeCareer(storage, settlement.career));
  return {
    career: settlement.career,
    leftRace: settlement.ledger,
    persistence: Result.match(written, {
      onFailure: failureOf,
      onSuccess: (): Persistence => saved,
    }),
    status: "ready",
  } satisfies CareerLoad;
});

const loaded = Effect.fn("career.save.load")(function* loaded(
  open: () => SaveStorage
) {
  const storage = yield* acquireStorage(open);
  const text = yield* readItem(storage, SAVE_KEY);
  if (text === null) {
    return { status: "absent" } satisfies CareerLoad;
  }
  const parsed = parseCareer(text);
  if (!parsed.ok) {
    return { error: parsed.error, status: "corrupt" } satisfies CareerLoad;
  }
  return yield* resumed(storage, parsed.career);
});

const cleared = Effect.fn("career.save.clear")(function* cleared(
  open: () => SaveStorage
) {
  const storage = yield* acquireStorage(open);
  const text = yield* readItem(storage, SAVE_KEY);
  if (text !== null) {
    yield* backUpItem(storage, BACKUP_KEY, text);
  }
  yield* removeItem(storage, SAVE_KEY);
  return { status: "reset" } satisfies Reset;
});

export const loadCareer = (open: () => SaveStorage): CareerLoad =>
  outcomeOf(loaded(open));

export const storeCareer = (
  open: () => SaveStorage,
  career: CareerState
): Stored =>
  outcomeOf(
    Effect.as(
      Effect.flatMap(acquireStorage(open), (storage) =>
        writeCareer(storage, career)
      ),
      saved
    )
  );

export const startOver = (open: () => SaveStorage): Reset =>
  outcomeOf(cleared(open));

export const saveStateOf = (load: CareerLoad): SaveState => {
  if (load.status === "ready") {
    return { career: load.career, leftRace: load.leftRace, status: "ready" };
  }
  if (load.status === "corrupt") {
    return load;
  }
  return { status: "empty" };
};

export const careerSeedFrom = (unit: number): number =>
  Math.floor(Math.min(Math.max(unit, 0), 1 - Number.EPSILON) * SEED_RANGE);

export const freshCareer = (unit: number): CareerState =>
  newCareer(careerSeedFrom(unit));

export const browserStorage = (): SaveStorage => globalThis.localStorage;

export const randomUnit = (): number => {
  const [word] = crypto.getRandomValues(new Uint32Array(1));
  return (word ?? 0) / SEED_RANGE;
};
