import { createRace, stepRace } from "./race.ts";
import { createScratch, createTickFrame, scratchFor } from "./room-frame.ts";
import { createReadTick, readTick } from "./room-wire.ts";
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
}

export const createTapeWriter = (
  mostPacketBytes: number,
  save: (part: number, bytes: Uint8Array) => void
): TapeWriter => {
  const buffer = new Uint8Array(
    TICKS_IN_PART * (LENGTH_BYTES + mostPacketBytes)
  );
  const view = new DataView(buffer.buffer);
  let used = 0;
  let ticks = 0;
  let parts = 0;
  const finish = (): void => {
    if (ticks > 0) {
      save(parts, buffer.slice(0, used));
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
  };
};

export const hexOfWords = (words: Uint32Array): string =>
  [...words].map((word) => word.toString(16).padStart(8, "0")).join("");

export type TapeReplay =
  | { readonly kind: "wrongSetup"; readonly digest: string }
  | { readonly kind: "unreadable"; readonly afterTick: number }
  | { readonly kind: "gap"; readonly afterTick: number; readonly tick: number }
  | { readonly kind: "diverged"; readonly tick: number }
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
  parts: readonly Uint8Array[]
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
  for (const part of parts) {
    const view = new DataView(part.buffer, part.byteOffset, part.byteLength);
    let at = 0;
    while (at < part.byteLength) {
      const length = view.getUint16(at, true);
      const packet = new DataView(
        part.buffer,
        part.byteOffset + at + LENGTH_BYTES,
        length
      );
      if (!readTick(packet, read)) {
        return { afterTick: state.tick, kind: "unreadable" };
      }
      if (read.frame.tick !== state.tick + 1) {
        return {
          afterTick: state.tick,
          kind: "gap",
          tick: read.frame.tick,
        };
      }
      stepRace(state, setup.track, read.frame);
      if (read.hashed) {
        hashRace(state, setupWords, scratchFor(scratch, state), hash);
        if (!sameWords(hash, read.hash)) {
          return { kind: "diverged", tick: read.frame.tick };
        }
        hashes += 1;
      }
      at += LENGTH_BYTES + length;
    }
  }
  return { hashes, kind: "matched", state };
};
