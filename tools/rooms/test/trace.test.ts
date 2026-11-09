import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import {
  riderTraceName,
  TRACE_ROW_FIELDS,
  TRACE_VERSION,
  TraceField,
} from "@racer/rooms/tape";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { main, traceReport } from "../src/trace.ts";

const TICKS_PER_SECOND = 60;
const ROW_MS = 250;
const TICKS_PER_ROW = 15;
const ROWS_PER_MINUTE = 240;

const row = (second: number, frameMs: number, gapMs: number): number[] => {
  const values = Array.from({ length: TRACE_ROW_FIELDS }, () => 0);
  values[TraceField.atMs] = second * 1000;
  values[TraceField.tick] = second * TICKS_PER_SECOND;
  values[TraceField.worstFrameMs] = frameMs;
  values[TraceField.worstTickGapMs] = gapMs;
  return values;
};

interface Change {
  readonly at: number;
  readonly frameMs?: number;
  readonly gapMs?: number;
  readonly rttMs?: number;
}

const steadyRows = (count: number, changes: readonly Change[]): number[] =>
  Array.from({ length: count }, (_, at) => {
    const change = changes.find((wanted) => wanted.at === at);
    const values = Array.from({ length: TRACE_ROW_FIELDS }, () => 0);
    values[TraceField.atMs] = (at + 1) * ROW_MS;
    values[TraceField.tick] = (at + 1) * TICKS_PER_ROW;
    values[TraceField.worstFrameMs] = change?.frameMs ?? 16;
    values[TraceField.worstTickGapMs] = change?.gapMs ?? 17;
    values[TraceField.worstRttMs] = change?.rttMs ?? (at % 2 === 0 ? 100 : 0);
    return values;
  }).flat();

const browser = {
  build: "abc",
  gpu: "Test GPU",
  graphics: "quality rung 1",
  version: TRACE_VERSION,
} as const;

const report = traceReport(
  [
    {
      rider: 0,
      trace: {
        ...browser,
        connections: [
          [
            ...row(1, 16, 17),
            ...row(2, 16, 300),
            ...row(10, 200, 17),
            ...row(11, 16, 210),
          ],
        ],
      },
    },
    { rider: 1, trace: { ...browser, connections: [[...row(2, 16, 17)]] } },
  ],
  { rows: [2 * TICKS_PER_SECOND, 0, 5, 1, 2 * TICKS_PER_SECOND, 1, 3, 0] }
);

describe("the trace report", () => {
  it("names each browser and separates a frozen browser's tick gap from the link's", () => {
    expect(report).toContain(
      "Rider 0: build abc, Test GPU, quality rung 1. Browser stalls in 1 s, missed controls in 1 s, slowed or surged in 0 s. Raced 0:11."
    );
    expect(report).toContain(
      "Of 2 rows with a gap of 100 ms or more, 1 while the browser froze, 0 on the link with a round-trip spike, 0 on the link with a steady round trip, and 1 on the link with no round trip measured."
    );
  });

  it("says when every rider missed controls in the same second", () => {
    expect(report).toContain(
      "Every rider missed controls in the same second 1 time(s)."
    );
  });

  it("lists only the bad seconds, on the race's clock, for every rider", () => {
    expect(report).toContain(
      "0:02  rider 0 frame 16 ms, tick gap 300 ms, round trip 0 ms, slowed 0 ms, surged 0, missed 5, late 1 | rider 1 frame 16 ms, tick gap 17 ms, round trip 0 ms, slowed 0 ms, surged 0, missed 3, late 0"
    );
    expect(report).toContain("0:10  rider 0 frame 200 ms");
    expect(report).not.toContain("0:01  ");
  });

  it("lists a second whose frames ran slowed or surged with nothing else wrong", () => {
    const slowed = row(3, 16, 17);
    slowed[TraceField.slowedMs] = 200;
    const surged = row(6, 16, 17);
    surged[TraceField.surgedFrames] = 4;
    const offPace = traceReport(
      [
        {
          rider: 0,
          trace: { ...browser, connections: [[...slowed, ...surged]] },
        },
      ],
      { rows: [] }
    );
    expect(offPace).toContain(
      "0:03  rider 0 frame 16 ms, tick gap 17 ms, round trip 0 ms, slowed 200 ms"
    );
    expect(offPace).toContain("surged 4, missed 0");
    expect(offPace).toContain("slowed or surged in 2 s.");
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
            connections: [[...row(1, 16, 17), ...frozen, ...gapEnd]],
          },
        },
      ],
      { rows: [] }
    );
    expect(stalledInGap).toContain("0:04  rider 0 frame 200 ms");
    expect(stalledInGap).toContain(
      "0 while the browser froze, 0 on the link with a round-trip spike, 0 on the link with a steady round trip, and 1 on the link with no round trip measured"
    );
  });

  it("places each connection's rows on the race's clock after a rejoin", () => {
    const stall = row(1, 200, 17);
    const later = row(1, 16, 17);
    later[TraceField.tick] = 11 * TICKS_PER_SECOND;
    const rejoined = traceReport(
      [{ rider: 0, trace: { ...browser, connections: [stall, later] } }],
      { rows: [] }
    );
    expect(rejoined).toContain("0:01  rider 0 frame 200 ms");
    expect(rejoined).not.toContain("0:11  rider 0 frame 200 ms");
  });
});

const oneRider = (connections: readonly (readonly number[])[]): string =>
  traceReport([{ rider: 0, trace: { ...browser, connections } }], {
    rows: [],
  });

describe("the stall report", () => {
  it("measures each floor's share of the race and splits each gap by what the browser and the round trip did", () => {
    const minute = steadyRows(ROWS_PER_MINUTE, [
      { at: 20, gapMs: 300, rttMs: 260 },
      { at: 40, gapMs: 150, rttMs: 110 },
      { at: 60, frameMs: 80, gapMs: 400, rttMs: 0 },
      { at: 79, frameMs: 490 },
      { at: 80, gapMs: 500 },
      { at: 100, gapMs: 60 },
    ]);
    expect(oneRider([minute])).toContain(
      "Raced 1:00. Rows whose worst tick gap reached 50, 100, 150, 250, and 500 ms came 5.0, 4.0, 4.0, 3.0, and 1.0 times a minute, and those gaps took 2.35%, 2.25%, 2.25%, 2.00%, and 0.83% of the race. Of 4 rows with a gap of 100 ms or more, 1 while the browser froze, 1 on the link with a round-trip spike, 1 on the link with a steady round trip, and 1 on the link with no round trip measured. Link gaps of 100 ms or more took 1.42% of the race."
    );
  });

  it("judges a round trip against its own connection's typical one after a rejoin", () => {
    const slow = steadyRows(8, [
      ...[0, 1, 2, 3, 4, 5, 6].map((at) => ({ at, rttMs: 150 })),
      { at: 7, gapMs: 200, rttMs: 180 },
    ]);
    const quick = steadyRows(8, [
      ...[0, 1, 2, 3, 4, 5, 6].map((at) => ({ at, rttMs: 100 })),
      { at: 7, gapMs: 200, rttMs: 180 },
    ]);
    expect(oneRider([slow, quick])).toContain(
      "Raced 0:04. Rows whose worst tick gap reached 50, 100, 150, 250, and 500 ms came 30.0, 30.0, 30.0, 0.0, and 0.0 times a minute, and those gaps took 10.00%, 10.00%, 10.00%, 0.00%, and 0.00% of the race. Of 2 rows with a gap of 100 ms or more, 0 while the browser froze, 1 on the link with a round-trip spike, 1 on the link with a steady round trip, and 0 on the link with no round trip measured."
    );
  });

  it("reads every race folder, sums up every rider and names each race it could not read", async () => {
    const tapes = mkdtempSync(path.join(os.tmpdir(), "rooms-trace-"));
    const save = (race: string, rider: number, rows: readonly number[]) => {
      mkdirSync(path.join(tapes, race), { recursive: true });
      writeFileSync(
        path.join(tapes, race, riderTraceName(rider)),
        JSON.stringify({ ...browser, connections: [rows] })
      );
    };
    save(
      "race-a",
      0,
      steadyRows(ROWS_PER_MINUTE, [
        { at: 20, gapMs: 300, rttMs: 0 },
        { at: 100, gapMs: 200, rttMs: 0 },
      ])
    );
    save(
      "race-a",
      1,
      steadyRows(ROWS_PER_MINUTE, [
        { at: 20, gapMs: 300, rttMs: 0 },
        { at: 120, gapMs: 200, rttMs: 0 },
      ])
    );
    save(
      "race-b",
      0,
      steadyRows(ROWS_PER_MINUTE, [
        { at: 20, gapMs: 600, rttMs: 300 },
        { at: 40, gapMs: 600, rttMs: 300 },
      ])
    );
    writeFileSync(path.join(tapes, "notes.txt"), "not a race");
    mkdirSync(path.join(tapes, "race-old"));
    writeFileSync(
      path.join(tapes, "race-old", riderTraceName(0)),
      JSON.stringify({ ...browser, rows: steadyRows(ROWS_PER_MINUTE, []) })
    );
    const printed: string[] = [];
    await main(["--races", tapes]).pipe(
      Effect.provide(NodeFileSystem.layer),
      Effect.provideService(Console.Console, {
        ...console,
        log: (...lines: readonly string[]) => {
          printed.push(...lines);
        },
      }),
      Effect.runPromise
    );
    const text = printed.join("\n");
    expect(text).toContain(
      "race-a rider 0, build abc: Raced 1:00. Rows whose worst tick gap reached 50, 100, 150, 250, and 500 ms came 2.0, 2.0, 2.0, 1.0, and 0.0 times a minute, and those gaps took 0.83%"
    );
    expect(text).toMatch(
      /race-b rider 0, build abc: [^\n]*Link gaps of 100 ms or more took 2\.00% of the race\.\n/u
    );
    expect(text).toContain(
      "3 riders in 2 races raced 3:00 in all. Link gaps of 100 ms or more took under 1.00% of the race for 2 of 3 riders. Their share was 0.83% at the median, 2.00% at the 90th percentile and 2.00% at worst. Over all racing, tick gaps of 50, 100, 150, 250, and 500 ms or more took 1.22%, 1.22%, 1.22%, 1.00%, and 0.67% of the time. Gaps of 100 ms or more split into 0.00% while the browser froze, 0.67% on the link with a round-trip spike, 0.00% on the link with a steady round trip, and 0.56% on the link with no round trip measured."
    );
    expect(text).toContain(
      "Skipped race-old: rider-0.trace.json is not a version 2 browser trace, so an older build wrote its columns."
    );
  });

  it("names each race it skipped when it could read none", async () => {
    const tapes = mkdtempSync(path.join(os.tmpdir(), "rooms-trace-"));
    mkdirSync(path.join(tapes, "race-old"));
    writeFileSync(
      path.join(tapes, "race-old", riderTraceName(0)),
      JSON.stringify({ ...browser, rows: steadyRows(ROWS_PER_MINUTE, []) })
    );
    const failure = await main(["--races", tapes]).pipe(
      Effect.provide(NodeFileSystem.layer),
      Effect.flip,
      Effect.runPromise
    );
    expect(failure.message).toContain(
      "Skipped race-old: rider-0.trace.json is not a version 2 browser trace, so an older build wrote its columns."
    );
  });
});
