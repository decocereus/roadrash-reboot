import { riderBlocks } from "@racer/sim/palette";
import type { RiderBlocks } from "@racer/sim/palette";
import type { RiderId } from "@racer/sim/state";

import type { Palette, Slot } from "./model-slots.ts";

export const blocksOf = (
  colours: ReadonlyMap<RiderId, number>,
  rider: RiderId
): RiderBlocks | undefined =>
  riderBlocks[colours.get(rider) ?? riderBlocks.length];

export const blockPaletteOf = (blocks: RiderBlocks): Palette =>
  new Map<Slot, number>([
    ["helmet", blocks.helmet],
    ["helmet2", blocks.helmetTrim],
    ["suit", blocks.suit],
    ["suit2", blocks.panel],
  ]);
