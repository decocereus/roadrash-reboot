import { describe, expect, it } from "vitest";

import { judge, requiredRows } from "../src/budgets.ts";
import { evaluateGate } from "../src/evaluate.ts";
import {
  BIKE_BYTES,
  samplesOf,
  steadyLanes,
  syntheticBudgets,
  syntheticBuild,
} from "./red-cases.ts";

const steady = { runner: 1, sim: 1 };

const rowName = (metric: string, scenario: string | null) =>
  `node ${scenario ?? "-"} ${metric} [`;

describe("rows judged over side A", () => {
  const build = {
    A: syntheticBuild("A", BIKE_BYTES),
    B: syntheticBuild("B", BIKE_BYTES),
  };
  const budgets = syntheticBudgets(build);

  it("refuses a run with no side A before judging any row that side A scales", () => {
    const steadyRun = evaluateGate(
      samplesOf("steady", steadyLanes(steady), build),
      budgets
    );
    const unmeasured = steadyRun.observations.map((each) =>
      each.lane === "node" && each.scenario === "reference-v1"
        ? { ...each, paired: null, runs: { ...each.runs, a: [] } }
        : each
    );
    const { evidence, verdicts } = judge(
      budgets.limits,
      unmeasured,
      requiredRows(["node"], [steadyRun.environment], [])
    );
    const judged = (metric: string, scenario: string | null) =>
      verdicts.some((verdict) =>
        verdict.text.includes(rowName(metric, scenario))
      );
    expect(evidence.length).toBeGreaterThan(0);
    expect(
      evidence.every(
        (line) => line.startsWith("FAIL") && line.includes("SideAMissing")
      )
    ).toBeTruthy();
    for (const [metric, scenario] of [
      ["sim.tick.p95", "reference-v1"],
      ["sim.tick.p99", "reference-v1"],
      ["room.tick.p95", "reference-v1"],
      ["lobby.tick.p95", null],
      ["roadLife.tick.p95", null],
    ] as const) {
      expect(
        evidence.some((line) => line.includes(rowName(metric, scenario)))
      ).toBeTruthy();
      expect(judged(metric, scenario)).toBeFalsy();
    }
    expect(judged("sim.tick.p95", "pack-riding-v1")).toBeTruthy();
  });

  it.each([
    ["no side-A readings beside a finite ratio", { a: [] }, 1],
    ["side-A readings beside no ratio", {}, null],
  ] as const)(
    "refuses a paired row with %s before judging it",
    (_case, runs, paired) => {
      const steadyRun = evaluateGate(
        samplesOf("steady", steadyLanes(steady), build),
        budgets
      );
      const row = (each: (typeof steadyRun.observations)[number]) =>
        each.lane === "node" &&
        each.metric === "sim.tick.p95" &&
        each.scenario === "reference-v1";
      const broken = steadyRun.observations.map((each) =>
        row(each) ? { ...each, paired, runs: { ...each.runs, ...runs } } : each
      );
      expect(broken.filter(row)).toHaveLength(1);
      const { evidence, verdicts } = judge(
        budgets.limits,
        broken,
        requiredRows(["node"], [steadyRun.environment], [])
      );
      const name = rowName("sim.tick.p95", "reference-v1");
      expect(evidence.filter((line) => line.includes(name))).toStrictEqual([
        expect.stringContaining(
          "SideAMissing: this row is judged by its A/B ratio"
        ),
      ]);
      expect(
        verdicts.some((verdict) => verdict.text.includes(name))
      ).toBeFalsy();
    }
  );
});
