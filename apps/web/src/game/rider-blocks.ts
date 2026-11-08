import type { RiderBlocks } from "@racer/sim/palette";

import type { Palette, Slot } from "./model-slots.ts";

export const blockPaletteOf = (blocks: RiderBlocks): Palette =>
  new Map<Slot, number>([
    ["helmet", blocks.helmet],
    ["helmet2", blocks.helmetTrim],
    ["suit", blocks.suit],
    ["suit2", blocks.panel],
  ]);
