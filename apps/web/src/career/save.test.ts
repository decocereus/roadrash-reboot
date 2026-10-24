import { recordedRules } from "@racer/career/bench";
import { serialiseCareer } from "@racer/career/save";
import { startRace } from "@racer/career/settle";
import { nextRaceSeed } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { repairBill } from "@racer/career/tables";
import { describe, expect, it } from "vitest";

import type { SaveStorageFailed } from "./save-storage-error.ts";
import type { SaveStorage } from "./save-storage.ts";
import {
  BACKUP_KEY,
  careerSeedFrom,
  freshCareer,
  loadCareer,
  SAVE_KEY,
  saveStateOf,
  startOver,
  storeCareer,
} from "./save.ts";

type Failing = "get" | "set" | "backup" | "remove";

interface MemoryStorage extends SaveStorage {
  readonly items: Map<string, string>;
  readonly calls: string[];
  failing: Failing | null;
}

const refuse = (operation: Failing): never => {
  throw new Error(`The browser refused ${operation}.`);
};

const memoryStorage = (): MemoryStorage => {
  const items = new Map<string, string>();
  const calls: string[] = [];
  const storage: MemoryStorage = {
    calls,
    failing: null,
    getItem: (key) => {
      calls.push(`get ${key}`);
      return storage.failing === "get"
        ? refuse("get")
        : (items.get(key) ?? null);
    },
    items,
    removeItem: (key) => {
      calls.push(`remove ${key}`);
      if (storage.failing === "remove") {
        refuse("remove");
      }
      items.delete(key);
    },
    setItem: (key, value) => {
      calls.push(`set ${key}`);
      const failing = key === BACKUP_KEY ? "backup" : "set";
      if (storage.failing === failing) {
        refuse(failing);
      }
      items.set(key, value);
    },
  };
  return storage;
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

const opened = (storage: SaveStorage) => () => storage;

const lockedAway = (): SaveStorage => {
  throw new Error("The browser denies storage to this page.");
};

const midRace = (career: CareerState): CareerState => {
  const started = startRace(
    recordedRules,
    career,
    "slag-row",
    nextRaceSeed(career)
  );
  if (!started.started) {
    throw new Error(`The race did not start: ${started.reason}`);
  }
  return started.career;
};

const anError: unknown = expect.any(Error);

const failed = (operation: SaveStorageFailed["operation"]) => {
  const failure: unknown = expect.objectContaining({
    _tag: "SaveStorageFailed",
    cause: anError,
    operation,
  });
  return { failure };
};

describe("the browser save", () => {
  it("has no career before the first one is written", () => {
    expect(loadCareer(recordedRules, opened(memoryStorage()))).toStrictEqual({
      status: "absent",
    });
  });

  it("gives back the career that was written, under one key", () => {
    const storage = memoryStorage();
    const career = { ...freshCareer(0.25), cash: 3200 };
    expect(storeCareer(opened(storage), career)).toStrictEqual({
      status: "saved",
    });
    expect([...storage.items.keys()]).toStrictEqual([SAVE_KEY]);
    expect(storage.calls).toStrictEqual([`set ${SAVE_KEY}`]);
    expect(loadCareer(recordedRules, opened(storage))).toStrictEqual({
      career,
      leftRace: null,
      persistence: { status: "unchanged" },
      status: "ready",
    });
  });

  it("reports what is wrong with a save it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "not a save");
    expect(loadCareer(recordedRules, opened(storage))).toStrictEqual({
      error: { field: "", kind: "notJson" },
      status: "corrupt",
    });
    storage.setItem(
      SAVE_KEY,
      serialiseCareer({ ...freshCareer(0.5), garage: [] })
    );
    expect(loadCareer(recordedRules, opened(storage))).toMatchObject({
      error: { kind: "inconsistent" },
      status: "corrupt",
    });
  });

  it("tells a browser that refuses storage, or a save it cannot read, apart from no save", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, serialiseCareer(freshCareer(0.3)));
    storage.failing = "get";
    const unreadable = loadCareer(recordedRules, opened(storage));
    const locked = loadCareer(recordedRules, lockedAway);
    expect([unreadable, locked]).toStrictEqual([
      { ...failed("read"), status: "readFailed" },
      { ...failed("acquire"), status: "unavailable" },
    ]);
    expect([saveStateOf(unreadable), saveStateOf(locked)]).toStrictEqual([
      { status: "empty" },
      { status: "empty" },
    ]);
  });

  it("keeps the last save when the browser refuses a write", () => {
    const storage = memoryStorage();
    const first = freshCareer(0.2);
    storeCareer(opened(storage), first);
    storage.failing = "set";
    expect(
      storeCareer(opened(storage), { ...first, cash: 9000 })
    ).toStrictEqual({ ...failed("write"), status: "writeFailed" });
    expect(storage.items.get(SAVE_KEY)).toBe(serialiseCareer(first));
    expect(storeCareer(lockedAway, first)).toStrictEqual({
      ...failed("acquire"),
      status: "unavailable",
    });
  });

  it("keeps the unreadable save under the backup key when the player starts over", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "not a save");
    storage.calls.length = 0;
    expect(startOver(opened(storage))).toStrictEqual({ status: "reset" });
    expect(storage.calls).toStrictEqual([
      `get ${SAVE_KEY}`,
      `set ${BACKUP_KEY}`,
      `remove ${SAVE_KEY}`,
    ]);
    expect(storage.getItem(BACKUP_KEY)).toBe("not a save");
    expect(loadCareer(recordedRules, opened(storage))).toStrictEqual({
      status: "absent",
    });
  });

  it("never removes the save when starting over fails to read it, back it up or remove it", () => {
    const outcomes = (["get", "backup", "remove"] as const).map((failing) => {
      const storage = memoryStorage();
      storage.setItem(SAVE_KEY, "the only save");
      storage.setItem(BACKUP_KEY, "an older backup");
      storage.calls.length = 0;
      storage.failing = failing;
      const reset = startOver(opened(storage));
      return {
        backup: storage.items.get(BACKUP_KEY),
        calls: storage.calls,
        primary: storage.items.get(SAVE_KEY),
        reset,
      };
    });
    expect(outcomes).toStrictEqual([
      {
        backup: "an older backup",
        calls: [`get ${SAVE_KEY}`],
        primary: "the only save",
        reset: { ...failed("read"), status: "readFailed" },
      },
      {
        backup: "an older backup",
        calls: [`get ${SAVE_KEY}`, `set ${BACKUP_KEY}`],
        primary: "the only save",
        reset: { ...failed("backup"), status: "writeFailed" },
      },
      {
        backup: "the only save",
        calls: [`get ${SAVE_KEY}`, `set ${BACKUP_KEY}`, `remove ${SAVE_KEY}`],
        primary: "the only save",
        reset: { ...failed("remove"), status: "writeFailed" },
      },
    ]);
  });

  it("starting over with no save keeps the old backup", () => {
    const storage = memoryStorage();
    storage.setItem(BACKUP_KEY, "an older backup");
    storage.calls.length = 0;
    expect(startOver(opened(storage))).toStrictEqual({ status: "reset" });
    expect([storage.calls, storage.items.get(BACKUP_KEY)]).toStrictEqual([
      [`get ${SAVE_KEY}`, `remove ${SAVE_KEY}`],
      "an older backup",
    ]);
    expect(startOver(lockedAway)).toStrictEqual({
      ...failed("acquire"),
      status: "unavailable",
    });
  });

  it("charges a race left by a reload as a wreck, once", () => {
    const storage = memoryStorage();
    const career = midRace(freshCareer(0.75));
    storeCareer(opened(storage), career);
    const first = loadCareer(recordedRules, opened(storage));
    const bill = repairBill(recordedRules, career.level, career.bikeId);
    expect(first).toMatchObject({
      career: { activeRace: null, cash: career.cash - bill },
      leftRace: { repair: bill, result: "quit" },
      persistence: { status: "saved" },
      status: "ready",
    });
    expect(loadCareer(recordedRules, opened(storage))).toMatchObject({
      career: { activeRace: null, cash: career.cash - bill },
      leftRace: null,
      persistence: { status: "unchanged" },
      status: "ready",
    });
  });

  it("keeps a left race charged once when the browser refuses to save the charge", () => {
    const storage = memoryStorage();
    const career = midRace(freshCareer(0.75));
    storeCareer(opened(storage), career);
    const racing = storage.items.get(SAVE_KEY);
    storage.failing = "set";
    const first = loadCareer(recordedRules, opened(storage));
    const bill = repairBill(recordedRules, career.level, career.bikeId);
    expect(first).toMatchObject({
      career: { activeRace: null, cash: career.cash - bill },
      leftRace: { repair: bill, result: "quit" },
      persistence: { ...failed("write"), status: "writeFailed" },
      status: "ready",
    });
    expect(saveStateOf(first)).toMatchObject({ status: "ready" });
    expect(storage.items.get(SAVE_KEY)).toBe(racing);
    storage.failing = null;
    if (first.status !== "ready") {
      throw new Error("The career did not load.");
    }
    expect(storeCareer(opened(storage), first.career)).toStrictEqual({
      status: "saved",
    });
    expect(loadCareer(recordedRules, opened(storage))).toStrictEqual({
      career: first.career,
      leftRace: null,
      persistence: { status: "unchanged" },
      status: "ready",
    });
  });

  it("saves a new career over a save it could not read, and reports only a refused write", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "the unread save");
    storage.failing = "get";
    const unread = loadCareer(recordedRules, opened(storage));
    const career = freshCareer(0.6);
    const stored = storeCareer(opened(storage), career);
    storage.failing = "set";
    const refused = storeCareer(opened(storage), { ...career, cash: 9000 });
    storage.failing = null;
    expect({
      loaded: loadCareer(recordedRules, opened(storage)),
      refused,
      stored,
      unread: unread.status,
    }).toStrictEqual({
      loaded: {
        career,
        leftRace: null,
        persistence: { status: "unchanged" },
        status: "ready",
      },
      refused: { ...failed("write"), status: "writeFailed" },
      stored: { status: "saved" },
      unread: "readFailed",
    });
  });

  it("says so instead of throwing when the browser refuses the write", () => {
    const storage = fullStorage();
    expect(storeCareer(opened(storage), freshCareer(0.1))).toStrictEqual({
      ...failed("write"),
      status: "writeFailed",
    });
    expect(startOver(opened(storage))).toStrictEqual({
      ...failed("remove"),
      status: "writeFailed",
    });
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
    storeCareer(opened(storage), career);
    const loaded = loadCareer(recordedRules, opened(storage));
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
