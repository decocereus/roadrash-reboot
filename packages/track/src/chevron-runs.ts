import type { RoadId } from "./road.ts";
import type { StretchId } from "./stretches.ts";
import type { ChevronRun } from "./track.ts";

export const chevronRuns = {
  "breakwater-run": [
    { from: 1280, side: -1, to: 1345 },
    { from: 2164, side: 1, to: 2247 },
    { from: 4974, side: 1, to: 5046 },
    { from: 6239, side: 1, to: 6327 },
    { from: 7982, side: 1, to: 8064 },
  ],
  "madrid-gran-via": [
    { from: 55, side: 1, to: 127 },
    { from: 128, side: -1, to: 171 },
    { from: 380, side: 1, to: 487 },
    { from: 488, side: -1, to: 493 },
    { from: 676, side: -1, to: 729 },
    { from: 1493, side: -1, to: 1590 },
    { from: 2019, side: 1, to: 2166 },
  ],
  "madrid-hook": [
    { from: 341, side: 1, to: 489 },
    { from: 490, side: -1, to: 509 },
    { from: 751, side: 1, to: 886 },
  ],
  "ridge-road": [
    { from: 1438, side: 1, to: 1505 },
    { from: 2728, side: -1, to: 2804 },
    { from: 4936, side: -1, to: 5007 },
    { from: 5990, side: 1, to: 6069 },
    { from: 7056, side: 1, to: 7064 },
    { from: 7065, side: -1, to: 7145 },
  ],
  "slag-row": [
    { from: 262, side: -1, to: 333 },
    { from: 1616, side: 1, to: 1713 },
    { from: 3444, side: -1, to: 3543 },
    { from: 4318, side: 1, to: 4413 },
    { from: 5042, side: -1, to: 5133 },
    { from: 6895, side: 1, to: 6994 },
    { from: 7898, side: -1, to: 7992 },
  ],
} as const satisfies Record<RoadId | StretchId, readonly ChevronRun[]>;
