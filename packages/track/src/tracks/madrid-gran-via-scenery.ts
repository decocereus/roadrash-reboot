import type { Scenery } from "../track.ts";
import { madridGranViaBlocks1 } from "./madrid-gran-via-blocks-1.ts";
import { madridGranViaBlocks2 } from "./madrid-gran-via-blocks-2.ts";
import { madridGranViaBlocks3 } from "./madrid-gran-via-blocks-3.ts";

export const madridGranViaScenery: Scenery = {
  blocks: [
    ...madridGranViaBlocks1,
    ...madridGranViaBlocks2,
    ...madridGranViaBlocks3,
  ],
  cover: "paving",
  patches: [
    {
      cover: "grass",
      ring: [
        [61, 118],
        [80, 198],
        [237, 193],
        [235, 38],
        [65, 28],
      ],
    },
    {
      cover: "grass",
      ring: [
        [-2085, -280],
        [-2000, -292],
        [-1975, -337],
        [-2020, -372],
        [-2105, -357],
        [-2135, -302],
      ],
    },
  ],
  water: [],
};
