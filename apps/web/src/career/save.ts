import { parseCareer, serialiseCareer } from "@racer/career/save";
import type { SaveError } from "@racer/career/save-schema";
import { resumeCareer } from "@racer/career/settle";
import type { Ledger } from "@racer/career/settle";
import { newCareer } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";

export const SAVE_KEY = "rushline.career";
export const BACKUP_KEY = "rushline.career.backup";

const SEED_RANGE = 2 ** 32;

export interface SaveStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export type LoadedSave =
  | { readonly status: "empty" }
  | {
      readonly status: "ready";
      readonly career: CareerState;
      readonly leftRace: Ledger | null;
    }
  | { readonly status: "corrupt"; readonly error: SaveError };

export type SaveState = LoadedSave | { readonly status: "loading" };

const readText = (storage: SaveStorage, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const storeCareer = (
  storage: SaveStorage,
  career: CareerState
): boolean => {
  try {
    storage.setItem(SAVE_KEY, serialiseCareer(career));
    return true;
  } catch {
    return false;
  }
};

export const loadCareer = (storage: SaveStorage): LoadedSave => {
  const text = readText(storage, SAVE_KEY);
  if (text === null) {
    return { status: "empty" };
  }
  const parsed = parseCareer(text);
  if (!parsed.ok) {
    return { error: parsed.error, status: "corrupt" };
  }
  const resumed = resumeCareer(parsed.career);
  if (!resumed.settled) {
    return { career: parsed.career, leftRace: null, status: "ready" };
  }
  storeCareer(storage, resumed.career);
  return { career: resumed.career, leftRace: resumed.ledger, status: "ready" };
};

export const startOver = (storage: SaveStorage): boolean => {
  const text = readText(storage, SAVE_KEY);
  try {
    if (text !== null) {
      storage.setItem(BACKUP_KEY, text);
    }
    storage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
};

export const careerSeedFrom = (unit: number): number =>
  Math.floor(Math.min(Math.max(unit, 0), 1 - Number.EPSILON) * SEED_RANGE);

export const freshCareer = (unit: number): CareerState =>
  newCareer(careerSeedFrom(unit));

export const browserStorage = (): SaveStorage | null => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

export const randomUnit = (): number => {
  const [word] = crypto.getRandomValues(new Uint32Array(1));
  return (word ?? 0) / SEED_RANGE;
};
