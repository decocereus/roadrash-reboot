import { describe, expect, it } from "vitest";

import { judge, metricKinds } from "../src/budgets.ts";
import type { Limit } from "../src/budgets.ts";

const ENVIRONMENT = "gpu-chromium-intel";
const SCENARIO = "pack-riding-v1";

const overLimit = (metric: string) => {
  const kind = metricKinds.find((each) => each.metric === metric);
  if (!kind) {
    throw new Error(`No kind named ${metric}.`);
  }
  const limit: Limit = {
    baseline: 1,
    derivation: "test",
    direction: kind.direction,
    environment: ENVIRONMENT,
    metric,
    paired: kind.paired,
    scenario: SCENARIO,
    source: "test",
    unit: kind.unit,
    value: 1,
  };
  const {
    verdicts: [verdict],
  } = judge(
    [limit],
    [
      {
        environment: ENVIRONMENT,
        lane: "gpu",
        metric,
        note: "",
        paired: 1,
        runs: { a: [1], b: [2] },
        scenario: SCENARIO,
        value: 2,
      },
    ],
    [{ environment: ENVIRONMENT, kind, scenario: SCENARIO }]
  );
  return verdict;
};

describe("budget verdicts", () => {
  it("warns on triangles over their limit without failing", () => {
    const verdict = overLimit("render.triangles.max");
    expect(verdict?.ok).toBeTruthy();
    expect(verdict?.text).toMatch(/^WARN /u);
  });

  it("fails frame time over its limit", () => {
    const verdict = overLimit("frame.interval.p95");
    expect(verdict?.ok).toBeFalsy();
    expect(verdict?.text).toMatch(/^FAIL /u);
  });
});
