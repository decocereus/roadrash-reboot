import type { RoadId } from "./road.ts";
import type { StretchId } from "./stretches.ts";
import type { ChevronRun } from "./track.ts";

export const chevronRuns = {
  "breakwater-run": [
    { from: 1273, side: -1, to: 1347 },
    { from: 1517, side: 1, to: 1567 },
    { from: 2161, side: 1, to: 2248 },
    { from: 3863, side: 1, to: 3953 },
    { from: 4062, side: -1, to: 4103 },
    { from: 4977, side: 1, to: 5049 },
    { from: 6237, side: -1, to: 6238 },
    { from: 6239, side: 1, to: 6329 },
    { from: 7842, side: -1, to: 7903 },
    { from: 7918, side: -1, to: 8014 },
    { from: 8015, side: 1, to: 8068 },
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
