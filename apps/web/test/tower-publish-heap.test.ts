import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const BASELINE_TIER_ONLY = "--max-opt=1";
const PUBLISHES = fileURLToPath(
  new URL("tower-publish-heap.ts", import.meta.url)
);
const BUDGET_MS = 60_000;

const outputOf = (flags: readonly string[]) => {
  const run = spawnSync(process.execPath, [...flags], { encoding: "utf-8" });
  return { output: run.stdout, status: run.status };
};

describe("the race tower's publish and draw paths", () => {
  it(
    "publishes an unchanged tower without allocating, before V8 optimizes the read",
    () => {
      expect(
        outputOf([BASELINE_TIER_ONLY, PUBLISHES, "publish"])
      ).toStrictEqual({
        output: JSON.stringify({ built: 0, unchanged: true }),
        status: 0,
      });
    },
    BUDGET_MS
  );

  it(
    "writes changed rows and slides into vertex data without allocating once the draw path is warm",
    () => {
      expect(outputOf([PUBLISHES, "draw"])).toStrictEqual({
        output: JSON.stringify({ drawn: 0, slid: true }),
        status: 0,
      });
    },
    BUDGET_MS
  );
});
