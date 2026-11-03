import { readFileSync } from "node:fs";
import path from "node:path";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { layoutPadding } from "../src/node-lane.ts";
import {
  scenarios,
  validateWorkload,
  WINDOW_TICKS,
  workloadDigestOf,
  workloadRows,
} from "../src/scenarios.ts";
import type { WorkloadRows } from "../src/scenarios.ts";

const decodeRows = Schema.decodeUnknownSync(
  Schema.fromJsonString(workloadRows)
);

const captured: WorkloadRows = decodeRows(
  readFileSync(
    path.join(import.meta.dirname, "fixtures/pack-riding-v1-workload.json"),
    "utf-8"
  )
);

const [, packRiding] = scenarios;

const middle = Math.floor(WINDOW_TICKS / 2);

const changedAt = <T>(values: readonly T[], at: number, value: T): T[] =>
  values.map((each, index) => (index === at ? value : each));

const without = <T>(values: readonly T[], at: number): T[] =>
  values.filter((_, index) => index !== at);

describe("pack-riding workload validation", () => {
  it("accepts the captured pinned window", () => {
    expect(packRiding?.id).toBe("pack-riding-v1");
    expect(packRiding && validateWorkload(packRiding, captured)).toBeNull();
    expect(workloadDigestOf(captured)).toBe(packRiding?.workloadDigest);
  });

  it("rejects a tick with fewer rivals ahead than the pinned band", () => {
    const rows = {
      ...captured,
      ahead: changedAt(captured.ahead, middle, 5),
    };
    expect(packRiding && validateWorkload(packRiding, rows)).toStrictEqual({
      actual: "5",
      expected: "8..14 rivals",
      field: "ahead",
      tick: 2918 + middle,
    });
  });

  it("rejects a tick where the player is thrown", () => {
    const rows = {
      ...captured,
      modes: changedAt(captured.modes, middle, "thrown"),
    };
    expect(packRiding && validateWorkload(packRiding, rows)).toStrictEqual({
      actual: "thrown",
      expected: "riding",
      field: "mode",
      tick: 2918 + middle,
    });
  });

  it("rejects a window with one tick missing", () => {
    const rows = {
      ahead: without(captured.ahead, middle),
      modes: without(captured.modes, middle),
      speeds: without(captured.speeds, middle),
      ticks: without(captured.ticks, middle),
    };
    expect(packRiding && validateWorkload(packRiding, rows)).toStrictEqual({
      actual: String(2918 + middle + 1),
      expected: String(2918 + middle),
      field: "tick",
      tick: 2918 + middle,
    });
  });

  it("rejects a thinner window that stays inside the band", () => {
    const at = captured.ahead.indexOf(14);
    const rows = { ...captured, ahead: changedAt(captured.ahead, at, 13) };
    expect(packRiding && validateWorkload(packRiding, rows)).toStrictEqual({
      actual: "6494",
      expected: "6495",
      field: "total",
      tick: 3518,
    });
  });
});

describe("the stack layout of a measurement child", () => {
  it("differs for every timing child, so one bad layout costs one sample", () => {
    const children = ["reference-v1", "pack-riding-v1"].flatMap((scenario) =>
      [0, 1, 2, 3, 4].flatMap((pair) =>
        ["A", "B"].map((side) => `${scenario}-time-${pair}-${side}.json`)
      )
    );
    const lengths = children.map((child) => layoutPadding(child).length);
    expect(new Set(lengths).size).toBe(children.length);
  });
});
