import { describe, expect, it } from "vitest";

import { evaluateGpu } from "../src/gpu-frames.ts";
import {
  campaign,
  failing,
  isPack,
  limits,
  METAL,
  NVIDIA,
  packRiding,
  steady,
  steadyBar,
} from "./gpu-fixture.ts";

describe("gpu part budgets", () => {
  it("fails a B window whose riders take longer than the committed budget", () => {
    const budget = limits.find(
      (each) =>
        each.environment === METAL &&
        each.metric === "riders.cpu.p95" &&
        each.scenario === packRiding?.id
    );
    if (!budget) {
      throw new Error("budgets.json has no pack-riding riders budget.");
    }
    const slow = budget.value * 2;
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) =>
        isPack(scenario) && side === "B" && pair === 0
          ? { ...steady, riders: (index) => (index % 10 === 0 ? slow : 0.2) }
          : steady
      ),
      steadyBar,
      limits,
      METAL,
      null
    );
    expect(
      failing(evaluation.lines).map((line) => line.split(" observed=")[0])
    ).toStrictEqual([
      "FAIL gpu pack-riding-v1 riders.cpu.p95 [gpu-helium-metal]",
    ]);
    expect(evaluation.ok).toBeFalsy();
  });

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
        isPack(scenario) && side === "B" && pair === 0
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
