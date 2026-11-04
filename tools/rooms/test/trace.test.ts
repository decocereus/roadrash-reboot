import { TRACE_ROW_FIELDS, TraceField } from "@racer/rooms/tape";
import { describe, expect, it } from "vitest";

import { traceReport } from "../src/trace.ts";

const TICKS_PER_SECOND = 60;

const row = (second: number, frameMs: number, gapMs: number): number[] => {
  const values = Array.from({ length: TRACE_ROW_FIELDS }, () => 0);
  values[TraceField.atMs] = second * 1000;
  values[TraceField.tick] = second * TICKS_PER_SECOND;
  values[TraceField.worstFrameMs] = frameMs;
  values[TraceField.worstTickGapMs] = gapMs;
  return values;
};

const browser = { build: "abc", gpu: "Test GPU", graphics: "quality rung 1" };

const report = traceReport(
  [
    {
      rider: 0,
      trace: {
        ...browser,
        rows: [
          ...row(1, 16, 17),
          ...row(2, 16, 300),
          ...row(10, 200, 17),
          ...row(11, 16, 210),
        ],
      },
    },
    { rider: 1, trace: { ...browser, rows: [...row(2, 16, 17)] } },
  ],
  { rows: [2 * TICKS_PER_SECOND, 0, 5, 1, 2 * TICKS_PER_SECOND, 1, 3, 0] }
);

describe("the trace report", () => {
  it("names each browser and separates stalls from tick gaps", () => {
    expect(report).toContain(
      "Rider 0: build abc, Test GPU, quality rung 1. Browser stalls in 1 s, tick gaps within a second of a stall in 1 s, tick gaps with no stall near in 1 s, missed controls in 1 s."
    );
  });

  it("says when every rider missed controls in the same second", () => {
    expect(report).toContain(
      "Every rider missed controls in the same second 1 time(s)."
    );
  });

  it("lists only the bad seconds, on the race's clock, for every rider", () => {
    expect(report).toContain(
      "0:02  rider 0 frame 16 ms, tick gap 300 ms, round trip 0 ms, held 0, doubled 0, missed 5, late 1 | rider 1 frame 16 ms, tick gap 17 ms, round trip 0 ms, held 0, doubled 0, missed 3, late 0"
    );
    expect(report).toContain("0:10  rider 0 frame 200 ms");
    expect(report).not.toContain("0:01  ");
  });

  it("places a stall by the browser's clock while no ticks are arriving", () => {
    const frozen = row(4, 200, 17);
    frozen[TraceField.tick] = 1 * TICKS_PER_SECOND;
    const gapEnd = row(5, 16, 2000);
    const stalledInGap = traceReport(
      [
        {
          rider: 0,
          trace: {
            ...browser,
            rows: [...row(1, 16, 17), ...frozen, ...gapEnd],
          },
        },
      ],
      { rows: [] }
    );
    expect(stalledInGap).toContain("0:04  rider 0 frame 200 ms");
    expect(stalledInGap).toContain(
      "tick gaps within a second of a stall in 1 s"
    );
  });
});
