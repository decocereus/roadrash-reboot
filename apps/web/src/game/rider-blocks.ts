import type { RiderBlocks } from "@racer/sim/palette";

import type { Palette } from "./assets.ts";

export const blockPaletteOf = (blocks: RiderBlocks): Palette =>
  new Map<string, number>([
    ["helmet", blocks.helmet],
    ["helmet2", blocks.helmetTrim],
    ["suit", blocks.suit],
    ["suit2", blocks.panel],
  ]);
