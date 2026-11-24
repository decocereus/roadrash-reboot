import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const BASELINE_TIER_ONLY = "--max-opt=1";
const PUBLISHES = fileURLToPath(
  new URL("tower-publish-heap.ts", import.meta.url)
);
const BUDGET_MS = 60_000;

describe("the race tower's publish path", () => {
  it(
    "publishes an unchanged tower without allocating, before V8 optimizes the publish path",
    () => {
      const run = spawnSync(process.execPath, [BASELINE_TIER_ONLY, PUBLISHES], {
        encoding: "utf-8",
      });
      expect({ output: run.stdout, status: run.status }).toStrictEqual({
        output: JSON.stringify({ built: 0, unchanged: true }),
        status: 0,
      });
    },
    BUDGET_MS
  );
});
