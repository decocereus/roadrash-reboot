import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { slagRow } from "@racer/track/tracks/slag-row";
import { describe, expect, it } from "vitest";

import { track } from "./race-fixtures.ts";
import type { RaceView } from "./race-view.ts";
import { createRace, defaultSetup, emptyFrame, stepRace } from "./race.ts";
import { HASH_WORDS } from "./snapshot-bytes.ts";
import { eventSchemas, eventTags } from "./snapshot-events.ts";
import { hashBytes, hashText } from "./snapshot-hash.ts";
import { setupDigest } from "./snapshot-setup.ts";
import {
  hashRace,
  restoreInto,
  restoreSnapshot,
  snapshotCapacity,
  writeSnapshot,
} from "./snapshot.ts";
import { PLAYER_RIDER, riderIdAt, riderOf } from "./state.ts";
import type {
  HazardTag,
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderId,
} from "./state.ts";

const pilotedSetup = (course: Track, seed: number): RaceSetup => {
  const setup = defaultSetup(course, seed);
  return { ...setup, player: { ...setup.player, controller: "pilot" } };
};

const piloted = (course: Track, seed: number): RaceState =>
  createRace(pilotedSetup(course, seed));

const bufferFor = (state: RaceView): DataView =>
  new DataView(new ArrayBuffer(snapshotCapacity(state)));

const bytesOf = (state: RaceView, course: Track = track): Uint8Array => {
  const buffer = bufferFor(state);
  const written = writeSnapshot(state, setupDigest(state, course), buffer);
  return new Uint8Array(buffer.buffer, 0, written);
};

const viewOf = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const crashTag = (event: RaceEvent | undefined): HazardTag | null => {
  if (event?.kind !== "crash") {
    throw new Error("The restored race holds no crash in that slot.");
  }
  return event.hazard;
};

const CRASH_TAG: HazardTag = { command: "spin", id: "oil-1", kind: "oil" };

const WRECKED: RaceEvent = { kind: "wrecked", rider: PLAYER_RIDER };

const crashOf = (hazard: HazardTag | null): RaceEvent => ({
  by: null,
  cause: "hazard",
  hazard,
  kind: "crash",
  rider: PLAYER_RIDER,
  speed: 12.5,
});

const snapshotWith = (
  state: RaceState,
  events: readonly RaceEvent[]
): Uint8Array => {
  state.events.length = 0;
  state.events.push(...events);
  return bytesOf(state);
};

const hashOf = (state: RaceView, course: Track): string => {
  const words = new Uint32Array(HASH_WORDS);
  hashRace(state, setupDigest(state, course), bufferFor(state), words);
  return hashText(words);
};

const ride = (
  state: RaceState,
  course: Track,
  ticks: number
): readonly string[] => {
  const hashes: string[] = [];
  const digest = setupDigest(state, course);
  const words = new Uint32Array(HASH_WORDS);
  const buffer = new DataView(new ArrayBuffer(2 * snapshotCapacity(state)));
  for (let tick = 0; tick < ticks; tick += 1) {
    stepRace(state, course, emptyFrame);
    hashRace(state, digest, buffer, words);
    hashes.push(hashText(words));
  }
  return hashes;
};

const CORPUS_BYTES = 32;
const RESTORE_AT = 420;
const CONTINUE_TICKS = 600;
const SCAN_TICKS = 2400;
const EARLY_TICK = 60;
const DIRTY_TICKS = 137;
const FOREIGN_TICKS = 91;
const SEED = 5;
const SLAG_SEED = 7;
const COLLIDING_TICK = 554;
const LIVE_LOAD = 1.0286586751722668;
const COLLIDING_LOAD = 0.004018674765221998;
const LIVE_FINISH_TICK = -1;
const COLLIDING_FINISH_TICK = -0.003906011592334835;
const COMPENSATED_WORD = 36;
const COMPENSATED_FLIP = 2_147_483_684;
const COMPENSATED_NEXT = 0x11_22_33_44;
const COMPENSATED_SUM = 2_434_904_901;
const PAIR_BYTES = 16;
const MOMENT_TIMEOUT_MS = 120_000;

const momentsOf = (
  state: RaceState,
  course: Track,
  ticks: number
): readonly number[] => {
  let atFight = -1;
  let atFall = -1;
  let atPursuit = -1;
  for (let tick = 0; tick < ticks; tick += 1) {
    stepRace(state, course, emptyFrame);
    for (const rider of state.riders) {
      if (atFight < 0 && (rider.attack !== "none" || rider.hitStun > 0)) {
        atFight = state.tick;
      }
      if (atFall < 0 && (rider.mode === "lying" || rider.mode === "running")) {
        atFall = state.tick;
      }
      if (atPursuit < 0 && rider.chase !== null) {
        atPursuit = state.tick;
      }
    }
  }
  return [atFight, atFall, atPursuit];
};

describe("a race snapshot", () => {
  it("measures the bytes it writes, at the start and mid-race", () => {
    const state = piloted(track, 5);
    expect(bytesOf(state)).toHaveLength(snapshotCapacity(state));
    ride(state, track, 600);
    expect(bytesOf(state)).toHaveLength(snapshotCapacity(state));
  });

  it("writes, restores and writes again to identical bytes", () => {
    const state = piloted(track, 5);
    ride(state, track, RESTORE_AT);
    const first = bytesOf(state);
    const restored = restoreSnapshot(pilotedSetup(track, 5), viewOf(first));
    expect(restored.tick).toBe(state.tick);
    expect([...bytesOf(restored)]).toStrictEqual([...first]);
  });

  it.each([
    { course: track, name: "the reference road", seed: SEED },
    { course: compileTrack(slagRow), name: "Slag Row", seed: SLAG_SEED },
  ])(
    "carries $name on from a snapshot of an early tick, a fight, a crash and a chase",
    ({ course, seed }) => {
      const moments = momentsOf(piloted(course, seed), course, SCAN_TICKS);
      expect(moments.filter((tick) => tick > 0)).toHaveLength(moments.length);
      for (const at of [EARLY_TICK, ...moments]) {
        const straightOn = piloted(course, seed);
        ride(straightOn, course, at);
        const bytes = bytesOf(straightOn, course);
        const expected = ride(straightOn, course, CONTINUE_TICKS);
        expect(expected).toHaveLength(CONTINUE_TICKS);
        const fresh = restoreSnapshot(
          pilotedSetup(course, seed),
          viewOf(bytes)
        );
        expect(fresh.tick).toBe(at);
        expect(ride(fresh, course, CONTINUE_TICKS)).toStrictEqual(expected);
        const dirty = piloted(course, seed);
        ride(dirty, course, DIRTY_TICKS);
        ride(piloted(course, seed + 1), course, FOREIGN_TICKS);
        restoreInto(dirty, setupDigest(dirty, course), viewOf(bytes));
        expect(ride(dirty, course, CONTINUE_TICKS)).toStrictEqual(expected);
      }
    },
    MOMENT_TIMEOUT_MS
  );

  it("refuses a snapshot whose format does not match", () => {
    const state = piloted(track, 5);
    ride(state, track, 60);
    const view = viewOf(bytesOf(state));
    view.setUint32(0, 99, true);
    expect(() => {
      restoreInto(piloted(track, 5), setupDigest(state, track), view);
    }).toThrow("format 99");
  });

  it("refuses a snapshot taken of another race setup", () => {
    const state = piloted(track, 5);
    ride(state, track, 60);
    const bytes = bytesOf(state);
    const other = piloted(track, 9);
    expect(() => {
      restoreInto(other, setupDigest(other, track), viewOf(bytes));
    }).toThrow("another race setup");
  });

  it("refuses a snapshot taken on another road", () => {
    const course = compileTrack(slagRow);
    const state = piloted(course, 5);
    ride(state, course, 60);
    const bytes = bytesOf(state, course);
    const here = piloted(track, 5);
    expect(() => {
      restoreInto(here, setupDigest(here, track), viewOf(bytes));
    }).toThrow("another race setup");
  });

  it("refuses a truncated snapshot", () => {
    const state = piloted(track, 5);
    ride(state, track, 60);
    const bytes = bytesOf(state);
    const short = bytes.slice(0, bytes.byteLength - 1);
    expect(() => {
      restoreInto(piloted(track, 5), setupDigest(state, track), viewOf(short));
    }).toThrow("the buffer holds");
  });

  it("refuses a snapshot header shorter than one header", () => {
    const state = piloted(track, 5);
    const bytes = bytesOf(state).slice(0, 8);
    expect(() => {
      restoreInto(piloted(track, 5), setupDigest(state, track), viewOf(bytes));
    }).toThrow("snapshot header");
  });

  it("refuses a snapshot that names a rider in a fractional slot", () => {
    const quiet = piloted(track, 5);
    const chasing = piloted(track, 5);
    const first = riderOf(chasing.riders, PLAYER_RIDER);
    const second = riderOf(chasing.riders, riderIdAt(1));
    if (!(first && second)) {
      throw new Error("The race has no riders.");
    }
    first.chase = second.id;
    const plain = bytesOf(quiet);
    const marked = bytesOf(chasing);
    const differing = [...plain].flatMap((byte, at) =>
      byte === marked[at] ? [] : [at]
    );
    expect(differing).toStrictEqual([differing[0] ?? -1]);
    const view = viewOf(marked);
    view.setFloat64((differing[0] ?? 0) - 7, 0.5, true);
    expect(() => {
      restoreInto(piloted(track, 5), setupDigest(quiet, track), view);
    }).toThrow("slot 0.5");
  });

  it("gives every race event kind one tag and one field table", () => {
    expect(Object.keys(eventTags).toSorted()).toStrictEqual(
      Object.keys(eventSchemas).toSorted()
    );
    expect(new Set(Object.values(eventTags)).size).toBe(
      Object.keys(eventTags).length
    );
  });

  it("round trips one event of every kind", () => {
    const state = piloted(track, 5);
    ride(state, track, 30);
    const who = (slot: number): RiderId => {
      const rider = riderOf(
        state.riders,
        riderIdAt(slot % state.riders.length)
      );
      if (!rider) {
        throw new Error("The race has no riders.");
      }
      return rider.id;
    };
    const made: readonly RaceEvent[] = [
      {
        attack: "punch",
        kind: "attack",
        rider: who(0),
        side: 1,
        weapon: "club",
      },
      { kind: "bump", rider: who(1) },
      {
        cop: who(6),
        fine: 1500,
        kind: "busted",
        rider: who(2),
        s: 12.5,
        weapon: "cue",
        x: -1.25,
      },
      {
        by: who(3),
        cause: "traffic",
        hazard: { command: "spawn-1", id: "hazard-3", kind: "oil" },
        kind: "crash",
        rider: who(1),
        speed: 44.5,
      },
      { kind: "finish", rider: who(0), tick: 2000 },
      { kind: "glance", rider: who(4) },
      {
        effect: "slip",
        hazard: { command: null, id: "hazard-9", kind: "pothole" },
        kind: "hazard",
        rider: who(2),
        speed: 30,
      },
      {
        attack: "kick",
        kind: "hit",
        rider: who(1),
        target: who(2),
        weapon: "none",
      },
      { by: null, kind: "knockedDown", rider: who(3), speed: 15 },
      {
        airSeconds: 0.5,
        impact: 6.25,
        kind: "land",
        rider: who(0),
        s: 900,
        x: 0,
      },
      { closingSpeed: 22, hazard: null, kind: "nearMiss", rider: who(5) },
      { kind: "pursuit", rider: who(6), target: who(0) },
      { kind: "remount", rider: who(3) },
      { kind: "riderContact", other: who(2), rider: who(1) },
      { kind: "weaponBroken", rider: who(4), weapon: "sign" },
      { kind: "weaponTaken", rider: who(5), target: who(4), weapon: "chain" },
      { kind: "wrecked", rider: who(2) },
    ];
    expect(made).toHaveLength(Object.keys(eventTags).length);
    state.events.length = 0;
    state.events.push(...made);
    const bytes = bytesOf(state);
    const target = piloted(track, 5);
    restoreInto(target, setupDigest(target, track), viewOf(bytes));
    expect(target.events).toStrictEqual(made);
  });

  it("separates two races that differ only in one rider's load", () => {
    const state = piloted(track, SEED);
    ride(state, track, COLLIDING_TICK);
    const rider = riderOf(state.riders, riderIdAt(1));
    if (!rider) {
      throw new Error("The race has no riders.");
    }
    expect(rider.load).toBe(LIVE_LOAD);
    const live = hashOf(state, track);
    rider.load = COLLIDING_LOAD;
    expect(hashOf(state, track)).not.toBe(live);
  });

  it("separates two races that differ only in one rider's finishing tick", () => {
    const state = piloted(track, SEED);
    ride(state, track, COLLIDING_TICK);
    const rider = riderOf(state.riders, riderIdAt(1));
    if (!rider) {
      throw new Error("The race has no riders.");
    }
    expect(rider.finishTick).toBe(LIVE_FINISH_TICK);
    const live = hashOf(state, track);
    rider.finishTick = COLLIDING_FINISH_TICK;
    expect(hashOf(state, track)).not.toBe(live);
  });

  it("changes when one word moves and the next word compensates", () => {
    const words = new Uint32Array(HASH_WORDS);
    const left = new DataView(new ArrayBuffer(PAIR_BYTES));
    const right = new DataView(new ArrayBuffer(PAIR_BYTES));
    for (const view of [left, right]) {
      view.setUint32(0, COMPENSATED_WORD, true);
      view.setUint32(4, COMPENSATED_NEXT, true);
      view.setUint32(8, 0x55_66_77_88, true);
      view.setUint32(12, 0x99_aa_bb_cc, true);
    }
    right.setUint32(0, COMPENSATED_FLIP, true);
    right.setUint32(4, COMPENSATED_SUM, true);
    hashBytes(left, 0, PAIR_BYTES, words);
    const first = hashText(words);
    hashBytes(right, 0, PAIR_BYTES, words);
    expect(hashText(words)).not.toBe(first);
  });

  it("refuses a snapshot taken on a road whose bends were moved", () => {
    const state = piloted(track, SEED);
    ride(state, track, EARLY_TICK);
    const bent: Track = {
      ...track,
      curvature: track.curvature.map((value) => value + 0.001),
    };
    expect(setupDigest(state, bent)).not.toStrictEqual(
      setupDigest(state, track)
    );
    const bytes = bytesOf(state, bent);
    expect(() => {
      restoreInto(
        piloted(track, SEED),
        setupDigest(state, track),
        viewOf(bytes)
      );
    }).toThrow("another race setup");
  });

  it("restores a signed zero into a destination holding a positive zero", () => {
    const state = piloted(track, SEED);
    const rider = riderOf(state.riders, PLAYER_RIDER);
    const [hazard] = state.hazards;
    if (!(rider && hazard)) {
      throw new Error("The race has no riders or no hazards.");
    }
    rider.lateralSpeed = -0;
    state.hazards[0] = { ...hazard, x: -0 };
    const bytes = bytesOf(state);
    const dirty = piloted(track, SEED);
    ride(dirty, track, DIRTY_TICKS);
    const [standing] = dirty.hazards;
    if (standing) {
      dirty.hazards[0] = { ...standing, x: 0 };
    }
    restoreInto(dirty, setupDigest(dirty, track), viewOf(bytes));
    expect(Object.is(dirty.hazards[0]?.x, -0)).toBeTruthy();
    expect(
      Object.is(riderOf(dirty.riders, PLAYER_RIDER)?.lateralSpeed, -0)
    ).toBeTruthy();
    expect([...bytesOf(dirty)]).toStrictEqual([...bytes]);
  });

  it("restores a race carrying events without building new ones", () => {
    const state = piloted(track, SEED);
    ride(state, track, COLLIDING_TICK);
    const fight = state.events.find(({ kind }) => kind === "hit");
    if (!fight) {
      throw new Error(`Tick ${COLLIDING_TICK} of the race has no hit.`);
    }
    const bytes = bytesOf(state);
    const target = piloted(track, SEED);
    const digest = setupDigest(target, track);
    restoreInto(target, digest, viewOf(bytes));
    const first = [...target.events];
    restoreInto(target, digest, viewOf(bytes));
    expect(target.events).toHaveLength(first.length);
    for (const [index, event] of first.entries()) {
      expect(target.events[index]).toBe(event);
    }
    expect(target.events.map(({ kind }) => kind)).toStrictEqual(
      state.events.map(({ kind }) => kind)
    );
    expect(target.events).toContainEqual(fight);
  });

  it("restores an alternating sequence of events without building new ones", () => {
    const state = piloted(track, SEED);
    const target = piloted(track, SEED);
    const digest = setupDigest(target, track);
    const tagged = snapshotWith(state, [crashOf(CRASH_TAG)]);
    const other = snapshotWith(state, [WRECKED]);

    restoreInto(target, digest, viewOf(tagged));
    const [first] = target.events;
    restoreInto(target, digest, viewOf(other));
    const [between] = target.events;
    restoreInto(target, digest, viewOf(tagged));
    expect(target.events[0]).toBe(first);

    restoreInto(target, digest, viewOf(other));
    expect(target.events[0]).toBe(between);
    expect(between).not.toBe(first);
  });

  it("restores a hazard tag that passed through none without building a new one", () => {
    const state = piloted(track, SEED);
    const target = piloted(track, SEED);
    const digest = setupDigest(target, track);
    const tagged = snapshotWith(state, [crashOf(CRASH_TAG)]);
    const bare = snapshotWith(state, [crashOf(null)]);

    restoreInto(target, digest, viewOf(tagged));
    const first = crashTag(target.events[0]);
    restoreInto(target, digest, viewOf(bare));
    expect(crashTag(target.events[0])).toBeNull();

    restoreInto(target, digest, viewOf(tagged));
    expect(crashTag(target.events[0])).toBe(first);
    expect(crashTag(target.events[0])).toStrictEqual(CRASH_TAG);
  });

  it("keeps a signed zero, an infinity and a NaN through a round trip", () => {
    const state = piloted(track, 5);
    const rider = riderOf(state.riders, PLAYER_RIDER);
    if (!rider) {
      throw new Error("The race has no riders.");
    }
    rider.lateralSpeed = -0;
    rider.post = Number.POSITIVE_INFINITY;
    rider.load = Number.NEGATIVE_INFINITY;
    expect(rider.pilotLine).toBeNaN();
    const bytes = bytesOf(state);
    const target = piloted(track, 5);
    restoreInto(target, setupDigest(target, track), viewOf(bytes));
    const back = riderOf(target.riders, PLAYER_RIDER);
    expect(Object.is(back?.lateralSpeed, -0)).toBeTruthy();
    expect(back?.post).toBe(Number.POSITIVE_INFINITY);
    expect(back?.load).toBe(Number.NEGATIVE_INFINITY);
    expect(back?.pilotLine).toBeNaN();
  });

  it("hashes every NaN to the same 128 bits", () => {
    const state = piloted(track, 5);
    const rider = riderOf(state.riders, PLAYER_RIDER);
    if (!rider) {
      throw new Error("The race has no riders.");
    }
    rider.pilotLine = Number.NaN;
    const canonical = hashOf(state, track);
    rider.pilotLine = 0 / 0;
    expect(hashOf(state, track)).toBe(canonical);
    rider.pilotLine = Number.POSITIVE_INFINITY - Number.POSITIVE_INFINITY;
    expect(hashOf(state, track)).toBe(canonical);
  });

  it("changes the hash when one tick of the race changes", () => {
    const state = piloted(track, 5);
    const hashes = ride(state, track, 90);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(hashes.every((hash) => hash.length === 32)).toBeTruthy();
  });

  it("hashes a ramp of every length to its recorded 128 bits", () => {
    const words = new Uint32Array(HASH_WORDS);
    const bytes = new DataView(new ArrayBuffer(CORPUS_BYTES));
    const taken: string[] = [];
    for (let count = 0; count <= CORPUS_BYTES; count += 1) {
      for (let at = 0; at < count; at += 1) {
        bytes.setUint8(at, (at * 7 + 1) % 256);
      }
      hashBytes(bytes, 0, count, words);
      taken.push(hashText(words));
    }
    expect(new Set(taken).size).toBe(taken.length);
    expect(taken[0]).toBe("00000000000000000000000000000000");
    expect(taken[1]).toBe("da3dd3f084f1d1dd84f1d1dd84f1d1dd");
    expect(taken[CORPUS_BYTES]).toBe("9484de4b64f208db1af7b2d82a698bad");
  });
});
