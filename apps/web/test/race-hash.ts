import type { RaceView } from "@racer/sim/race-view";
import { hashRace, snapshotCapacity } from "@racer/sim/snapshot";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { hashText } from "@racer/sim/snapshot-hash";
import { setupDigest } from "@racer/sim/snapshot-setup";
import type { Track } from "@racer/track/track";

export interface RaceHasher {
  readonly digest: Uint32Array;
  readonly words: Uint32Array;
  readonly hash: (state: RaceView) => string;
}

export const hasherFor = (state: RaceView, track: Track): RaceHasher => {
  const digest = setupDigest(state, track);
  const words = new Uint32Array(HASH_WORDS);
  let buffer = new DataView(new ArrayBuffer(snapshotCapacity(state)));
  return {
    digest,
    hash: (live) => {
      const needed = snapshotCapacity(live);
      if (buffer.byteLength < needed) {
        buffer = new DataView(new ArrayBuffer(needed));
      }
      hashRace(live, digest, buffer, words);
      return hashText(words);
    },
    words,
  };
};
