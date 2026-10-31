import { armClaims } from "@racer/track/crossings";
import { createRandom } from "@racer/track/random";
import type { Track } from "@racer/track/track";

const ARM_BLOCK_MARGIN = 2;

export interface Block {
  readonly side: number;
  readonly s: number;
  readonly length: number;
  readonly seed: number;
}

export const layBlocks = (track: Track, front: number): Block[] => {
  const blocks: Block[] = [];
  const random = createRandom(track.plan.seed + 77);
  for (const side of [-1, 1]) {
    let s = track.startS;
    while (s < track.endS) {
      const length = 14 + random() * 20;
      blocks.push({
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
