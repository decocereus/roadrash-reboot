import { recordedRules } from "@racer/career/bench";
import { serialiseCareer } from "@racer/career/save";
import { resumeCareer, startRace } from "@racer/career/settle";
import { sellBike } from "@racer/career/shop";
import { nextRaceSeed } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { repairBill } from "@racer/career/tables";
import { describe, expect, it, onTestFinished } from "vitest";

import type { SaveStorageFailed } from "./save-storage-error.ts";
import type { SaveLocks, SaveStorage } from "./save-storage.ts";
import {
  BACKUP_KEY,
  careerSeedFrom,
  freshCareer,
  holdCareer,
  loadCareer,
  SAVE_KEY,
  saveStateOf,
  startOver,
  storeCareer,
} from "./save.ts";
import type { CareerPage, SaveState } from "./save.ts";

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
  const started = startRace(career, "slag-row", nextRaceSeed(career));
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
      { status: "unread" },
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
    const bill = repairBill(career.tier, career.bikeId);
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
    const bill = repairBill(career.tier, career.bikeId);
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

  it("marks the career unsaved when the browser refuses to save a left race's charge", () => {
    const storage = memoryStorage();
    storeCareer(opened(storage), midRace(freshCareer(0.75)));
    storage.failing = "set";
    expect(
      saveStateOf(loadCareer(recordedRules, opened(storage)))
    ).toMatchObject({ status: "ready", unsaved: true });
  });

  it("leaves the career marked saved when the load wrote the charge or had nothing to write", () => {
    const storage = memoryStorage();
    storeCareer(opened(storage), midRace(freshCareer(0.75)));
    const charged = loadCareer(recordedRules, opened(storage));
    const unchanged = loadCareer(recordedRules, opened(storage));
    expect([saveStateOf(charged), saveStateOf(unchanged)]).toMatchObject([
      { status: "ready", unsaved: false },
      { status: "ready", unsaved: false },
    ]);
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

type PageEvent = "pagehide" | "pageshow";

const fakePage = () => {
  const listeners: [PageEvent, (event: { persisted: boolean }) => void][] = [];
  let reloads = 0;
  const page = {
    addEventListener: (
      type: PageEvent,
      listener: (event: { persisted: boolean }) => void
    ) => {
      listeners.push([type, listener]);
    },
    fire: (type: PageEvent, persisted: boolean) => {
      for (const [heard, listener] of listeners) {
        if (heard === type) {
          listener({ persisted });
        }
      }
    },
    location: {
      reload: () => {
        reloads += 1;
      },
    },
    reloads: () => reloads,
  };
  return page;
};

const openTab = async (
  locks: SaveLocks,
  storage: SaveStorage,
  page: CareerPage = fakePage()
) => {
  const shown: SaveState[] = [];
  const decided = Promise.withResolvers<null>();
  const tab = holdCareer(locks, page, opened(storage), (save) => {
    shown.push(save);
    decided.resolve(null);
  });
  onTestFinished(tab.release);
  tab.load(recordedRules);
  await decided.promise;
  return { shown, tab };
};

const lockFreed = async () => {
  await globalThis.navigator.locks.request(SAVE_KEY, () => null);
};

const refusingLocks: SaveLocks = {
  request: async () =>
    await Promise.reject(new Error("The browser refused the lock.")),
};

const readyWith = (career: CareerState): SaveState => ({
  career,
  leftRace: null,
  status: "ready",
  unsaved: false,
});

describe("one career tab", () => {
  it("gives a second tab no career to load or resume, and writes nothing it settles, buys, begins or erases", async () => {
    const storage = memoryStorage();
    const first = await openTab(globalThis.navigator.locks, storage);
    const racing = midRace({ ...freshCareer(0.75), cash: 1500 });
    first.tab.commit(racing);
    storage.calls.length = 0;
    const second = await openTab(globalThis.navigator.locks, storage);
    const settled = resumeCareer(recordedRules, racing).career;
    second.tab.commit(settled);
    second.tab.commit(sellBike(settled));
    second.tab.commit(freshCareer(0.2));
    second.tab.eraseSave();
    second.tab.load(recordedRules);
    expect(second.shown).toStrictEqual([{ status: "elsewhere" }]);
    expect(storage.calls).toStrictEqual([]);
    expect(storage.items.get(SAVE_KEY)).toBe(serialiseCareer(racing));
  });

  it("keeps the career for a tab that asks while the holder is letting go, as a reload does", async () => {
    const storage = memoryStorage();
    const first = await openTab(globalThis.navigator.locks, storage);
    first.tab.release();
    const reloaded = await openTab(globalThis.navigator.locks, storage);
    expect(reloaded.shown).toStrictEqual([{ status: "empty" }]);
  });

  it("lets go of the career when its page is hidden, so the page that replaces it holds it", async () => {
    const storage = memoryStorage();
    const leaving = fakePage();
    await openTab(globalThis.navigator.locks, storage, leaving);
    leaving.fire("pagehide", true);
    const next = await openTab(globalThis.navigator.locks, storage);
    expect(next.shown).toStrictEqual([{ status: "empty" }]);
  });

  it("refuses every save step from a page the browser brings back after it let go, while another page holds the career", async () => {
    const storage = memoryStorage();
    const career = { ...freshCareer(0.4), cash: 1000 };
    storage.setItem(SAVE_KEY, serialiseCareer(career));
    const leaving = fakePage();
    const first = await openTab(globalThis.navigator.locks, storage, leaving);
    leaving.fire("pagehide", true);
    const second = await openTab(globalThis.navigator.locks, storage);
    second.tab.commit({ ...career, cash: 9000 });
    leaving.fire("pageshow", true);
    storage.calls.length = 0;
    first.tab.commit({ ...career, cash: 1100 });
    first.tab.eraseSave();
    first.tab.load(recordedRules);
    expect(storage.calls).toStrictEqual([]);
    expect(storage.items.get(SAVE_KEY)).toBe(
      serialiseCareer({ ...career, cash: 9000 })
    );
    expect(first.shown).toStrictEqual([
      readyWith(career),
      { status: "elsewhere" },
    ]);
    expect(leaving.reloads()).toBe(1);
  });

  it("reloads a page the browser brings back from its history, which no longer holds the career", async () => {
    const page = fakePage();
    await openTab(globalThis.navigator.locks, memoryStorage(), page);
    page.fire("pageshow", false);
    expect(page.reloads()).toBe(0);
    page.fire("pageshow", true);
    expect(page.reloads()).toBe(1);
  });

  it("gives the career to a tab opened after the holder closed, which charges the left race once", async () => {
    const storage = memoryStorage();
    const first = await openTab(globalThis.navigator.locks, storage);
    const racing = midRace({ ...freshCareer(0.75), cash: 1500 });
    first.tab.commit(racing);
    first.tab.release();
    await lockFreed();
    const next = await openTab(globalThis.navigator.locks, storage);
    const bill = repairBill(racing.tier, racing.bikeId);
    expect(next.shown).toMatchObject([
      {
        career: { activeRace: null, cash: 1500 - bill },
        leftRace: { repair: bill, result: "quit" },
        status: "ready",
        unsaved: false,
      },
    ]);
    expect(storage.items.get(SAVE_KEY)).toBe(
      serialiseCareer(resumeCareer(recordedRules, racing).career)
    );
  });

  it("treats a lock the browser refuses as storage it denies, and touches no save", async () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, serialiseCareer(freshCareer(0.3)));
    storage.calls.length = 0;
    const { shown, tab } = await openTab(refusingLocks, storage);
    const fresh = freshCareer(0.6);
    tab.commit(fresh);
    expect(shown).toStrictEqual([
      { status: "empty" },
      { ...readyWith(fresh), unsaved: true },
    ]);
    expect(storage.calls).toStrictEqual([]);
  });
});
