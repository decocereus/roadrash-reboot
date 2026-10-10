import { serialiseCareer } from "@racer/career/save";
import { startRace } from "@racer/career/settle";
import { nextRaceSeed } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { repairBill } from "@racer/career/tables";
import { describe, expect, it } from "vitest";

import {
  BACKUP_KEY,
  careerSeedFrom,
  freshCareer,
  loadCareer,
  SAVE_KEY,
  startOver,
  storeCareer,
} from "./save.ts";
import type { SaveStorage } from "./save.ts";

interface MemoryStorage extends SaveStorage {
  readonly items: Map<string, string>;
}

const memoryStorage = (): MemoryStorage => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    items,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
};

const fullStorage = (): SaveStorage => ({
  getItem: () => null,
  removeItem: () => {
    throw new Error("The storage is read-only.");
  },
  setItem: () => {
    throw new Error("The quota is used up.");
  },
});

const midRace = (career: CareerState): CareerState => {
  const started = startRace(career, "slag-row", nextRaceSeed(career));
  if (!started.started) {
    throw new Error(`The race did not start: ${started.reason}`);
  }
  return started.career;
};

describe("the browser save", () => {
  it("has no career before the first one is written", () => {
    expect(loadCareer(memoryStorage())).toStrictEqual({ status: "empty" });
  });

  it("gives back the career that was written, under one key", () => {
    const storage = memoryStorage();
    const career = { ...freshCareer(0.25), cash: 3200 };
    expect(storeCareer(storage, career)).toBeTruthy();
    expect([...storage.items.keys()]).toStrictEqual([SAVE_KEY]);
    expect(loadCareer(storage)).toStrictEqual({
      career,
      leftRace: null,
      status: "ready",
    });
  });

  it("reports what is wrong with a save it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "not a save");
    expect(loadCareer(storage)).toStrictEqual({
      error: { field: "", kind: "notJson" },
      status: "corrupt",
    });
    storage.setItem(
      SAVE_KEY,
      serialiseCareer({ ...freshCareer(0.5), garage: [] })
    );
    expect(loadCareer(storage)).toMatchObject({
      error: { kind: "inconsistent" },
      status: "corrupt",
    });
  });

  it("keeps the unreadable save under the backup key when the player starts over", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "not a save");
    expect(startOver(storage)).toBeTruthy();
    expect(storage.getItem(BACKUP_KEY)).toBe("not a save");
    expect(loadCareer(storage)).toStrictEqual({ status: "empty" });
  });

  it("charges a race left by a reload as a wreck, once", () => {
    const storage = memoryStorage();
    const career = midRace(freshCareer(0.75));
    storeCareer(storage, career);
    const first = loadCareer(storage);
    const bill = repairBill(career.level, career.bikeId);
    expect(first).toMatchObject({
      career: { activeRace: null, cash: career.cash - bill },
      leftRace: { repair: bill, result: "quit" },
      status: "ready",
    });
    expect(loadCareer(storage)).toMatchObject({
      career: { activeRace: null, cash: career.cash - bill },
      leftRace: null,
      status: "ready",
    });
  });

  it("says so instead of throwing when the browser refuses the write", () => {
    const storage = fullStorage();
    expect(storeCareer(storage, freshCareer(0.1))).toBeFalsy();
    expect(startOver(storage)).toBeFalsy();
  });
});

describe("race seeds", () => {
  it("turns a random draw into a whole career seed", () => {
    expect(careerSeedFrom(0)).toBe(0);
    expect(careerSeedFrom(1)).toBe(2 ** 32 - 1);
    expect(Number.isInteger(careerSeedFrom(0.375))).toBeTruthy();
    expect(freshCareer(0.5).seed).toBe(2 ** 31);
  });

  it("gives every race of a career its own seed", () => {
    let career = freshCareer(0.4);
    const seeds = new Set<number>();
    for (let race = 0; race < 40; race += 1) {
      const seed = nextRaceSeed(career);
      seeds.add(seed);
      career = { ...midRace(career), activeRace: null };
    }
    expect(seeds.size).toBe(40);
  });

  it("draws the same race again after the save is written and read back", () => {
    const storage = memoryStorage();
    const career = { ...midRace(freshCareer(0.4)), activeRace: null };
    storeCareer(storage, career);
    const loaded = loadCareer(storage);
    expect(loaded.status === "ready" && nextRaceSeed(loaded.career)).toBe(
      nextRaceSeed(career)
    );
  });

  it("draws different races for two careers", () => {
    expect(nextRaceSeed(freshCareer(0.4))).not.toBe(
      nextRaceSeed(freshCareer(0.6))
    );
  });
});
