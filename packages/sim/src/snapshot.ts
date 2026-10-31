import type { RaceView } from "./race-view.ts";
import { createRace } from "./race.ts";
import { cursor, HASH_WORDS, refuse, WORD_BYTES } from "./snapshot-bytes.ts";
import {
  DIGEST_WORD_AT,
  FORMAT_WORD_AT,
  HEADER_BYTES,
  LENGTH_WORD_AT,
  raceSchema,
  SNAPSHOT_FORMAT,
  TICK_AT,
} from "./snapshot-format.ts";
import { hashBytes } from "./snapshot-hash.ts";
import { bytesOf, putRecord, takeRecord } from "./snapshot-members.ts";
import { setupDigest } from "./snapshot-setup.ts";
import type { RaceSetup, RaceState } from "./state.ts";

export const snapshotCapacity = (state: RaceView): number =>
  HEADER_BYTES + bytesOf(raceSchema, state);

export const writeSnapshot = (
  state: RaceView,
  digest: Uint32Array,
  out: DataView
): number => {
  const needed = snapshotCapacity(state);
  if (out.byteLength < needed) {
    refuse(
      `A snapshot of this race needs ${needed} bytes and the buffer holds ${out.byteLength}.`
    );
  }
  out.setUint32(FORMAT_WORD_AT, SNAPSHOT_FORMAT, true);
  out.setUint32(LENGTH_WORD_AT, needed, true);
  for (let word = 0; word < HASH_WORDS; word += 1) {
    out.setUint32(DIGEST_WORD_AT + word * WORD_BYTES, digest[word] ?? 0, true);
  }
  out.setFloat64(TICK_AT, state.tick, true);
  cursor.byte = HEADER_BYTES;
  putRecord(out, raceSchema, state);
  if (cursor.byte !== needed) {
    refuse(
      `A snapshot of this race measures ${needed} bytes and wrote ${cursor.byte}.`
    );
  }
  return needed;
};

const checkHeader = (
  state: RaceView,
  digest: Uint32Array,
  from: DataView
): number => {
  if (from.byteLength < HEADER_BYTES) {
    refuse(
      `A snapshot header is ${HEADER_BYTES} bytes and this buffer holds ${from.byteLength}.`
    );
  }
  const format = from.getUint32(FORMAT_WORD_AT, true);
  if (format !== SNAPSHOT_FORMAT) {
    refuse(
      `This snapshot is format ${format} and the race reads format ${SNAPSHOT_FORMAT}.`
    );
  }
  const length = from.getUint32(LENGTH_WORD_AT, true);
  if (from.byteLength < length) {
    refuse(
      `This snapshot is ${length} bytes and the buffer holds ${from.byteLength}.`
    );
  }
  for (let word = 0; word < HASH_WORDS; word += 1) {
    if (
      from.getUint32(DIGEST_WORD_AT + word * WORD_BYTES, true) !== digest[word]
    ) {
      refuse(
        "This snapshot was taken of another race setup, so it cannot be restored into this one."
      );
    }
  }
  if (state.riders.length === 0) {
    refuse("A race with no riders restores nothing.");
  }
  return length;
};

export const restoreInto = (
  state: RaceState,
  digest: Uint32Array,
  from: DataView
): void => {
  const length = checkHeader(state, digest, from);
  state.tick = from.getFloat64(TICK_AT, true);
  cursor.byte = HEADER_BYTES;
  takeRecord(from, raceSchema, state);
  if (cursor.byte !== length) {
    refuse(
      `This snapshot is ${length} bytes and the race read ${cursor.byte}.`
    );
  }
};

export const restoreSnapshot = (
  setup: RaceSetup,
  from: DataView
): RaceState => {
  const state = createRace(setup);
  restoreInto(state, setupDigest(state, setup.track), from);
  return state;
};

export const hashRace = (
  state: RaceView,
  digest: Uint32Array,
  scratch: DataView,
  into: Uint32Array
): number => {
  const written = writeSnapshot(state, digest, scratch);
  hashBytes(scratch, 0, written, into);
  return written;
};
