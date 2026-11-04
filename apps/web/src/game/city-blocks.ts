import { armClaims } from "@racer/track/crossings";
import { widestVergeAlong } from "@racer/track/districts";
import { createRandom } from "@racer/track/random";
import type { Track } from "@racer/track/track";

const ARM_BLOCK_MARGIN = 2;
const SHORTEST_BLOCK = 14;
export const LONGEST_BLOCK = 34;
export const FRONT_GAP = 1.2;

export interface Block {
  readonly side: number;
  readonly s: number;
  readonly length: number;
  readonly front: number;
  readonly seed: number;
}

export const layBlocks = (track: Track): Block[] => {
  const blocks: Block[] = [];
  const random = createRandom(track.plan.seed + 77);
  for (const side of [-1, 1]) {
    let s = track.startS;
    while (s < track.endS) {
      const length =
        SHORTEST_BLOCK + random() * (LONGEST_BLOCK - SHORTEST_BLOCK);
      const front = widestVergeAlong(track, s, s + length) + FRONT_GAP;
      blocks.push({
        front,
        length,
        s,
        seed: Math.floor(random() * 1_000_000),
        side,
      });
      const bend = track.curvature[Math.round(s - track.startS)] ?? 0;
      const stretch = 1 + Math.max(0, -side * bend) * (front + 12);
      s += (length + (random() < 0.2 ? 6 : 0.3)) / stretch;
    }
  }
  return blocks.filter(
    (block) =>
      !armClaims(
        track.crossings,
        block.s,
        block.s + block.length,
        block.side,
        ARM_BLOCK_MARGIN
      )
  );
};
