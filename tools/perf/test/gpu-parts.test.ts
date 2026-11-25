import { readFileSync } from "node:fs";
import path from "node:path";

import { browserHosts } from "@racer/devtools/browser-host";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { budgetsFile } from "../src/budgets.ts";
import { evaluateGpu } from "../src/gpu-frames.ts";
import { scenarios } from "../src/scenarios.ts";
import { campaign, failing, steady, steadyBar } from "./gpu-fixture.ts";

const { limits } = Schema.decodeUnknownSync(Schema.fromJsonString(budgetsFile))(
  readFileSync(path.join(import.meta.dirname, "../budgets.json"), "utf-8")
);

const NVIDIA = browserHosts["linux-nvidia"].perfEnvironment;
const [, packRiding] = scenarios;

describe("gpu part budgets", () => {
  it("fails a B window whose world, the clock and the scenery around the player, takes longer than the committed budget", () => {
    const budget = limits.find(
      (each) =>
        each.environment === NVIDIA &&
        each.metric === "world.cpu.p95" &&
        each.scenario === packRiding?.id
    );
    if (!budget) {
      throw new Error("budgets.json has no pack-riding world budget.");
    }
    const slow = budget.value * 2;
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) =>
        scenario.id === packRiding?.id && side === "B" && pair === 0
          ? { ...steady, world: (index) => (index % 10 === 0 ? slow : 0.05) }
          : steady
      ),
      steadyBar,
      limits,
      NVIDIA,
      null
    );
    expect(
      failing(evaluation.lines)
        .filter((line) => line.includes("cpu.p95"))
        .map((line) => line.split(" observed=")[0])
    ).toStrictEqual([
      "FAIL gpu pack-riding-v1 world.cpu.p95 [gpu-chromium-nvidia]",
    ]);
    expect(evaluation.ok).toBeFalsy();
  });
});
