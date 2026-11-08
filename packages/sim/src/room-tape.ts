import { createRace, stepRace } from "./race.ts";
import { createScratch, createTickFrame, scratchFor } from "./room-frame.ts";
import { createReadTick, readTick } from "./room-wire.ts";
import type { ReadTick } from "./room-wire.ts";
import { HASH_WORDS } from "./snapshot-bytes.ts";
import { setupDigest } from "./snapshot-setup.ts";
import { hashRace } from "./snapshot.ts";
import type { RaceSetup, RaceState } from "./state.ts";

const TICKS_IN_PART = 1800;
const LENGTH_BYTES = 2;

export interface TapeWriter {
  readonly add: (packet: Uint8Array) => void;
  readonly finish: () => void;
  readonly parts: () => number;
  readonly sofar: () => readonly Uint8Array[];
}

export const createTapeWriter = (
  mostPacketBytes: number,
  save: (part: number, bytes: Uint8Array) => void
): TapeWriter => {
  const buffer = new Uint8Array(
    TICKS_IN_PART * (LENGTH_BYTES + mostPacketBytes)
  );
  const view = new DataView(buffer.buffer);
  const kept: Uint8Array[] = [];
  let used = 0;
  let ticks = 0;
  let parts = 0;
  const finish = (): void => {
    if (ticks > 0) {
      const part = buffer.slice(0, used);
      kept.push(part);
      save(parts, part);
      parts += 1;
      used = 0;
      ticks = 0;
    }
  };
  return {
    add: (packet) => {
      view.setUint16(used, packet.length, true);
      buffer.set(packet, used + LENGTH_BYTES);
      used += LENGTH_BYTES + packet.length;
      ticks += 1;
      if (ticks === TICKS_IN_PART) {
        finish();
      }
    },
    finish,
    parts: () => parts,
    sofar: () => (used > 0 ? [...kept, buffer.slice(0, used)] : kept),
  };
};

export type TapeRead<Stop> =
  | { readonly kind: "read" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "stopped"; readonly stop: Stop };

export const readTapePart = <Stop>(
  part: DataView,
  read: ReadTick,
  visit: (read: ReadTick) => Stop | null
): TapeRead<Stop> => {
  let at = 0;
  while (at < part.byteLength) {
    if (at + LENGTH_BYTES > part.byteLength) {
      return { kind: "unreadable" };
    }
    const length = part.getUint16(at, true);
    const end = at + LENGTH_BYTES + length;
    if (
      end > part.byteLength ||
      !readTick(
        new DataView(part.buffer, part.byteOffset + at + LENGTH_BYTES, length),
        read
      )
    ) {
      return { kind: "unreadable" };
    }
    const stop = visit(read);
    if (stop !== null) {
      return { kind: "stopped", stop };
    }
    at = end;
  }
  return { kind: "read" };
};

export const hexOfWords = (words: Uint32Array): string =>
  [...words].map((word) => word.toString(16).padStart(8, "0")).join("");

export interface TapeEnding {
  readonly hash: string;
  readonly tick: number;
}

export type TapeReplay =
  | { readonly kind: "wrongSetup"; readonly digest: string }
  | { readonly kind: "unreadable"; readonly afterTick: number }
  | { readonly kind: "gap"; readonly afterTick: number; readonly tick: number }
  | { readonly kind: "diverged"; readonly tick: number }
  | {
      readonly kind: "wrongEnd";
      readonly afterTick: number;
      readonly endTick: number;
    }
  | {
      readonly kind: "matched";
      readonly hashes: number;
      readonly state: RaceState;
    };

const sameWords = (left: Uint32Array, right: Uint32Array): boolean =>
  left.every((word, index) => word === right[index]);

export const replayTape = (
  setup: RaceSetup,
  digest: string,
  parts: readonly Uint8Array[],
  end: TapeEnding
): TapeReplay => {
  const state = createRace(setup);
  const setupWords = setupDigest(state, setup.track);
  if (hexOfWords(setupWords) !== digest) {
    return { digest: hexOfWords(setupWords), kind: "wrongSetup" };
  }
  const scratch = createScratch(state);
  const read = createReadTick(createTickFrame());
  const hash = new Uint32Array(HASH_WORDS);
  let hashes = 0;
  const stepTick = (tick: ReadTick): TapeReplay | null => {
    if (tick.frame.tick !== state.tick + 1) {
      return { afterTick: state.tick, kind: "gap", tick: tick.frame.tick };
    }
    stepRace(state, setup.track, tick.frame);
    if (tick.hashed) {
      hashRace(state, setupWords, scratchFor(scratch, state), hash);
      if (!sameWords(hash, tick.hash)) {
        return { kind: "diverged", tick: tick.frame.tick };
      }
      hashes += 1;
    }
    return null;
  };
  for (const part of parts) {
    const result = readTapePart(
      new DataView(part.buffer, part.byteOffset, part.byteLength),
      read,
      stepTick
    );
    if (result.kind === "unreadable") {
      return { afterTick: state.tick, kind: "unreadable" };
    }
    if (result.kind === "stopped") {
      return result.stop;
    }
  }
  if (state.tick !== end.tick) {
    return { afterTick: state.tick, endTick: end.tick, kind: "wrongEnd" };
  }
  hashRace(state, setupWords, scratchFor(scratch, state), hash);
  if (hexOfWords(hash) !== end.hash) {
    return { kind: "diverged", tick: state.tick };
  }
  return { hashes: hashes + 1, kind: "matched", state };
};
