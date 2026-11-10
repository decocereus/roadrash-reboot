import { describe, expect, it } from "vitest";

import { decodeBaseline, recordBaseline } from "./pilot-replay-baseline.ts";
import type { Baseline } from "./pilot-replay-baseline.ts";
import type { Replay } from "./pilot-replay.ts";

const row = (id: string, hash: string, ticks = 100): Replay => ({
  final: hash,
  full: `${hash}-full`,
  id,
  result: "finished",
  ticks,
  window: `${hash}-window`,
});

const before: Baseline = {
  fixed: [row("ridge", "1"), row("slag", "2")],
  provenance: {
    fixed: 7200,
    limit: 54_000,
    recordedAt: ["a0674a52", "main"],
    recordedWith: "snapshot format 7.",
    window: { from: 2880, to: 3480 },
  },
  solo: [row("ridge", "1"), row("slag", "2")],
};

const recordedAt = ["385d6097", "fix/steer-ramp-in-sim"] as const;

describe("recording the replay baseline", () => {
  it("writes the rides, names each row that moved with its outcome, and keeps the earlier provenance", () => {
    const { baseline, rows } = recordBaseline(before, {
      fixed: [row("ridge", "1"), row("slag", "9")],
      fixedRide: 7200,
      limit: 54_000,
      reason: "when the sky fell.",
      recordedAt,
      solo: [row("ridge", "1"), { ...row("slag", "2", 90), result: "busted" }],
      window: { from: 2880, to: 3480 },
    });
    expect(rows).toBe(
      "Rows that moved: slag (solo, from finished at tick 100 to busted at tick 90); slag (fixed). The other rows are identical."
    );
    expect(baseline.provenance).toStrictEqual({
      fixed: 7200,
      limit: 54_000,
      recordedAt,
      recordedWith: `snapshot format 7. Re-recorded again when the sky fell. ${rows}`,
      window: { from: 2880, to: 3480 },
    });
    expect(decodeBaseline(JSON.stringify(baseline))).toStrictEqual(baseline);
  });

  it("says no row moved when every ride matches, and still records where and why", () => {
    const { baseline, rows } = recordBaseline(before, {
      fixed: before.fixed,
      fixedRide: 7200,
      limit: 54_000,
      reason: "on a quiet day.",
      recordedAt,
      solo: before.solo,
      window: { from: 2880, to: 3480 },
    });
    expect(rows).toBe("No row moved.");
    expect(baseline.provenance.recordedWith).toBe(
      "snapshot format 7. Re-recorded again on a quiet day. No row moved."
    );
    expect(baseline.provenance.recordedAt).toStrictEqual(recordedAt);
  });
});
