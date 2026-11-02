import type { RoomStatus } from "@racer/rooms/contract";
import { describe, expect, it } from "vitest";

import type { ClientResult } from "../src/load-plan.ts";
import { stepReport } from "../src/load-report.ts";
import type { Sample, StepFacts } from "../src/load-report.ts";

const MOST_LOAD = 10;
const SAMPLE_MS = 10_000;

const statusAt = (tick: number): RoomStatus => ({
  catchUpWakes: 0,
  names: [],
  phase: "racing",
  seats: [],
  tick,
  waiting: 4,
  wakes: tick,
  worstBehindTicks: 1,
});

const sampleAt = (at: number, tick: number): Sample => ({
  at,
  processes: new Map(),
  statuses: [statusAt(tick)],
});

const client: ClientResult = {
  capped: false,
  full: [],
  gaps: [[16, 100]],
  heard: 600,
  loopMaxMs: 1,
  loopP99Ms: 1,
  lost: 0,
  refused: 0,
  sent: 600,
  worstRttMs: 1,
};

const facts: StepFacts = {
  clients: [client],
  first: sampleAt(SAMPLE_MS, 600),
  inputHz: 60,
  loadAfter: 1,
  loadBefore: 1,
  mostLoad: MOST_LOAD,
  raceAt: 0,
  rideSeconds: 10,
  rooms: 1,
  seats: 4,
  second: sampleAt(2 * SAMPLE_MS, 1200),
  server: null,
};

describe("a load step's report", () => {
  it("counts a calm step that held", () => {
    const report = stepReport(facts);
    expect(report.counted).toBeTruthy();
    expect(report.held).toBeTruthy();
  });

  it("does not count a step that ended on a busy machine", () => {
    const report = stepReport({ ...facts, loadAfter: 2 * MOST_LOAD });
    expect(report.counted).toBeFalsy();
  });

  it("does not count a step the message cap ended", () => {
    const report = stepReport({
      ...facts,
      clients: [{ ...client, capped: true }],
    });
    expect(report.capped).toBeTruthy();
    expect(report.counted).toBeFalsy();
  });
});
