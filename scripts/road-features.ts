import type { FeatureEntry } from "./feature-map.ts";
import { sceneCounts, simTick } from "./player-features.ts";

export const roadFeatures: readonly FeatureEntry[] = [
  {
    docs: [
      "docs/architecture/tracks.md#tracks",
      "docs/design/tracks.md#breakwater-run-salt-coast",
      "docs/art/breakwater-stalls/README.md#contract",
    ],
    id: "bazaar",
    kind: "feature",
    owns: [
      "packages/track/src/stalls.ts",
      "packages/track/src/stalls.test.ts",
      "packages/sim/src/stalls.ts",
      "packages/sim/src/stalls-room.test.ts",
      "packages/sim/src/stalls.test.ts",
      "apps/web/src/game/bazaar.ts",
      "apps/web/src/game/bazaar-crowd.ts",
      "apps/web/test/bazaar.test.ts",
      "apps/web/test/bazaar-kit.test.ts",
    ],
    perf: [...sceneCounts, ...simTick],
    start: [
      "packages/track/src/stalls.ts",
      "apps/web/src/game/bazaar.ts",
      "apps/web/src/game/bazaar-crowd.ts",
    ],
    summary:
      "The market on a road's footpaths: the stall list a road compiles from its seed, the crash or touch a rider meets by speed in hitStalls, the merged stall meshes, and the crowd drawn at the stalls on the walker instances.",
    title: "Market stalls and their crowd",
    verify: ["bazaar.md"],
  },
  {
    docs: [
      "docs/architecture/tracks.md#tracks",
      "docs/design/tracks.md#summary",
    ],
    id: "roads",
    kind: "feature",
    owns: [
      "packages/track/src/tracks/**",
      "packages/track/src/regions.ts",
      "packages/track/src/roads.test.ts",
      "packages/track/src/chevron-runs.ts",
      "packages/sim/src/corner-warnings.ts",
      "packages/sim/src/corner-warnings.test.ts",
      "tools/road-test/**",
    ],
    perf: [],
    start: [
      "packages/track/src/tracks/slag-row.ts",
      "packages/track/src/regions.ts",
      "packages/sim/src/corner-warnings.ts",
    ],
    summary:
      "The roads and their regions: each road's sections, crests, truck starts, roadblock spots, the chevron runs that the riding-speed audit writes for the bends a rider has to brake for, and the blocks that levels 2 to 5 add. `pnpm road:test` races the bots to judge a road.",
    title: "The roads",
    verify: [],
  },
  {
    docs: [
      "docs/architecture/browser-client.md#browser-client",
      "docs/design/art-direction.md#region-skies",
    ],
    id: "time-of-day",
    kind: "feature",
    owns: [
      "apps/web/src/game/sky*.ts",
      "apps/web/test/sky-*.ts",
      "apps/web/test/world-light.test.ts",
    ],
    perf: [...sceneCounts, "world.cpu.p95"],
    start: ["apps/web/src/game/sky-clock.ts", "apps/web/src/game/sky.ts"],
    summary:
      "Dusk to night over a race: each look's later hours at shares of the road's nightTick, the sky clock that turns the race tick into one blended hour, the sky shader's gradient, sun, moon, stars and clouds, and lightRace, which steps the world's light and the grade when the hour moves. `?hour=<0..1>` pins it in a development build.",
    title: "Dusk to night",
    verify: ["time-of-day.md"],
  },
];
