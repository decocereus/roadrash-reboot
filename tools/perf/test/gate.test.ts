import { readFileSync } from "node:fs";
import path from "node:path";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

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
      ahead: changedAt(captured.ahead, middle, 10),
    };
    expect(packRiding && validateWorkload(packRiding, rows)).toStrictEqual({
      actual: "10",
      expected: "11..13 rivals",
      field: "ahead",
      tick: 2165 + middle,
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
      tick: 2165 + middle,
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
      actual: String(2165 + middle + 1),
      expected: String(2165 + middle),
      field: "tick",
      tick: 2165 + middle,
    });
  });

  it("rejects a thinner window that stays inside the band", () => {
    const at = captured.ahead.indexOf(13);
    const rows = { ...captured, ahead: changedAt(captured.ahead, at, 12) };
    expect(packRiding && validateWorkload(packRiding, rows)).toStrictEqual({
      actual: "7394",
      expected: "7395",
      field: "total",
      tick: 2765,
    });
  });
});
