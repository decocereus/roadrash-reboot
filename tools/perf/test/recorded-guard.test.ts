import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import {
  SIDE_A_METRIC,
  budgetsFile,
  recordedLimit,
  requiredRows,
} from "../src/budgets.ts";
import type { Budgets } from "../src/budgets.ts";
import {
  currentProtocol,
  measurementProtocol,
  protocolDigest,
} from "../src/protocol.ts";
import { admit, gateResult } from "../src/record.ts";
import type { ChildRuntime, GateResult } from "../src/record.ts";
import {
  derive,
  readingsOf,
  recordedProblems,
  recording,
  recordingFile,
} from "../src/recorded.ts";
import type { RecordedRun, Recording } from "../src/recorded.ts";

const REPO_ROOT = path.join(import.meta.dirname, "../../..");

const committed: Budgets = Schema.decodeUnknownSync(
  Schema.fromJsonString(budgetsFile)
)(readFileSync(path.join(REPO_ROOT, "tools/perf/budgets.json"), "utf-8"));

const environments = Object.keys(committed.nodeProfiles).toSorted();

const recordingOf = (environment: string): Recording =>
  Schema.decodeUnknownSync(Schema.fromJsonString(recording))(
    gunzipSync(
      readFileSync(path.join(REPO_ROOT, recordingFile(environment)))
    ).toString("utf-8")
  );

const recordedRows = (environment: string) =>
  requiredRows(["node"], [environment], [])
    .filter(({ kind }) => recordedLimit(kind))
    .map(({ kind, scenario }) => {
      const limit = committed.limits.find(
        (each) =>
          each.environment === environment &&
          each.metric === kind.metric &&
          each.scenario === scenario
      );
      if (!limit) {
        throw new Error(
          `budgets.json has no limit ${kind.metric}|${scenario ?? "-"}|${environment}`
        );
      }
      return {
        kind,
        limit: limit.value,
        name: `${kind.metric}|${scenario ?? "-"}`,
        readings: readingsOf(recordingOf(environment), kind, scenario),
      };
    });

const smallestCaughtSlowdown = (
  limit: number,
  readings: readonly { readonly value: number }[]
) =>
  Math.ceil(Math.max(...readings.map(({ value }) => limit / value - 1)) * 100);

const caughtFrom: ReadonlyMap<string, ReadonlyMap<string, number>> = new Map([
  [
    "node-darwin-arm64",
    new Map([
      ["lobby.tick.p95|-", 18],
      ["roadLife.tick.p95|-", 19],
      ["room.checkpoint.p50|pack-riding-v1", 22],
      ["room.checkpoint.p50|reference-v1", 29],
      ["room.confirm.p95|pack-riding-v1", 18],
      ["room.confirm.p95|reference-v1", 18],
      ["room.rollback.p95|pack-riding-v1", 21],
      ["room.rollback.p95|reference-v1", 18],
      ["room.tick.p95|pack-riding-v1", 18],
      ["room.tick.p95|reference-v1", 18],
      ["sim.tick.p99|pack-riding-v1", 18],
      ["sim.tick.p99|reference-v1", 19],
      ["snapshot.hash.p95|pack-riding-v1", 21],
      ["snapshot.hash.p95|reference-v1", 20],
      ["snapshot.restore.p95|pack-riding-v1", 23],
      ["snapshot.restore.p95|reference-v1", 28],
      ["snapshot.write.p95|pack-riding-v1", 23],
      ["snapshot.write.p95|reference-v1", 21],
      ["timing.stamp.trimmedMean|pack-riding-v1", 28],
      ["timing.stamp.trimmedMean|reference-v1", 21],
    ]),
  ],
  [
    "node-linux-x64",
    new Map([
      ["lobby.tick.p95|-", 50],
      ["roadLife.tick.p95|-", 25],
      ["room.checkpoint.p50|pack-riding-v1", 64],
      ["room.checkpoint.p50|reference-v1", 79],
      ["room.confirm.p95|pack-riding-v1", 22],
      ["room.confirm.p95|reference-v1", 21],
      ["room.rollback.p95|pack-riding-v1", 30],
      ["room.rollback.p95|reference-v1", 25],
      ["room.tick.p95|pack-riding-v1", 22],
      ["room.tick.p95|reference-v1", 21],
      ["sim.tick.p99|pack-riding-v1", 28],
      ["sim.tick.p99|reference-v1", 56],
      ["snapshot.hash.p95|pack-riding-v1", 44],
      ["snapshot.hash.p95|reference-v1", 36],
      ["snapshot.restore.p95|pack-riding-v1", 32],
      ["snapshot.restore.p95|reference-v1", 34],
      ["snapshot.write.p95|pack-riding-v1", 46],
      ["snapshot.write.p95|reference-v1", 44],
      ["timing.stamp.trimmedMean|pack-riding-v1", 80],
      ["timing.stamp.trimmedMean|reference-v1", 74],
    ]),
  ],
]);

const heldOutFailures: ReadonlyMap<
  string,
  readonly { cpu: string; overBy: string; row: string }[]
> = new Map([
  ["node-darwin-arm64", []],
  [
    "node-linux-x64",
    [
      {
        cpu: "AMD EPYC 9V45 96-Core Processor",
        overBy: "0.015%",
        row: "room.checkpoint.p50|pack-riding-v1",
      },
    ],
  ],
]);

describe("recorded limits", () => {
  it.each(environments)(
    "pass every recorded clean run in %s",
    (environment) => {
      const over = recordedRows(environment).flatMap(
        ({ limit, name, readings }) =>
          readings
            .filter(({ value }) => value > limit)
            .map(({ id, value }) => `${name} ${id} ${value} > ${limit}`)
      );
      expect(over).toStrictEqual([]);
    }
  );

  it.each(environments)(
    "fail exactly the pinned held-out runs in %s when each CPU type is judged by limits from the other CPU types",
    (environment) => {
      const rows = recordedRows(environment);
      const cpus = new Set(
        rows.flatMap(({ readings }) => readings.map(({ cpu }) => cpu))
      );
      const failures = [...cpus].flatMap((cpu) =>
        rows.flatMap(({ name, readings }) => {
          const others = derive(readings.filter((each) => each.cpu !== cpu));
          return others
            ? readings
                .filter((each) => each.cpu === cpu && each.value > others.value)
                .map(({ value }) => ({
                  cpu,
                  overBy: `${((value / others.value - 1) * 100).toFixed(3)}%`,
                  row: name,
                }))
            : [];
        })
      );
      expect(failures).toStrictEqual(heldOutFailures.get(environment));
    }
  );

  it.each(environments)(
    "catch a uniform slowdown from the pinned percentage on every run in %s",
    (environment) => {
      const caught = new Map(
        recordedRows(environment).map(({ limit, name, readings }) => [
          name,
          smallestCaughtSlowdown(limit, readings),
        ])
      );
      expect(caught).toStrictEqual(caughtFrom.get(environment));
    }
  );
});

describe("measurement protocol", () => {
  const recordings = new Map(
    environments.map((environment) => [environment, recordingOf(environment)])
  );

  it("accepts every counted recorded run under this harness's protocol", () => {
    expect(
      recordedProblems(committed, recordings, currentProtocol)
    ).toStrictEqual([]);
  });

  it.each([
    [
      "concurrent recompilation",
      { ...measurementProtocol, nodeFlags: ["--concurrent-recompilation"] },
    ],
    [
      "a 50% warm-up tolerance",
      {
        ...measurementProtocol,
        warmUp: { ...measurementProtocol.warmUp, tolerance: 0.5 },
      },
    ],
  ])(
    "fails the check when the harness measures with %s",
    (_change, changed) => {
      const problems = recordedProblems(
        committed,
        recordings,
        protocolDigest(changed)
      );
      expect(
        environments.every((environment) =>
          problems.some(
            (problem) =>
              problem.startsWith(recordingFile(environment)) &&
              problem.includes("was measured under protocol")
          )
        )
      ).toBeTruthy();
    }
  );
});

const NEWEST_MAC_RUN = "gate-2026-11-24T20-43-43-042Z-9f67ba9-3201f6e";

const macRecording = recordingOf("node-darwin-arm64");

const recordedMacRun = (): RecordedRun => {
  const run = macRecording.runs.find((each) => each.id === NEWEST_MAC_RUN);
  if (!run) {
    throw new Error(`the Mac recording lost ${NEWEST_MAC_RUN}`);
  }
  return run;
};

const nodeObservation = (
  metric: string,
  scenario: string | null,
  value: number,
  paired: number | null,
  a: readonly number[]
) => ({
  environment: "node-darwin-arm64",
  lane: "node",
  metric,
  paired,
  runs: { a, b: [value] },
  scenario,
  value,
});

const resultOf = (run: RecordedRun): GateResult => ({
  comparisonId: run.id,
  environment: "node-darwin-arm64",
  evidence: [],
  load: run.load,
  mode: run.mode,
  observations: [
    {
      environment: "build",
      lane: "build",
      metric: "assets.glb.rider_moves",
      paired: null,
      runs: { a: [null], b: [41_132] },
      scenario: null,
      value: 41_132,
    },
    ...run.scenarios.flatMap(({ paired, rows, scenario, sideA }) => [
      ...Object.entries(rows ?? {}).map(([metric, value]) =>
        nodeObservation(metric, scenario, value, null, [])
      ),
      ...Object.entries(paired).map(([metric, ratio]) =>
        nodeObservation(
          metric,
          scenario,
          1,
          ratio,
          metric === SIDE_A_METRIC && sideA !== undefined ? [sideA] : [1]
        )
      ),
    ]),
    ...Object.entries(run.unscoped ?? {}).map(([metric, value]) =>
      nodeObservation(metric, null, value, null, [])
    ),
  ],
  protocol: run.protocol,
  sides: {
    A: { revision: macRecording.sideA },
    B: { dirty: false, revision: run.b },
  },
});

const mac: ChildRuntime = {
  runtime: { arch: "arm64", cpu: "Apple M4 Pro", platform: "darwin" },
};

const admitted = (
  change: (result: GateResult) => GateResult,
  children: readonly ChildRuntime[] = [mac, mac]
) =>
  admit(
    change({
      ...resultOf(recordedMacRun()),
      comparisonId: "gate-2026-11-25T00-00-00-000Z-9f67ba9-0000000",
    }),
    children,
    macRecording,
    "test",
    currentProtocol
  );

describe("record.ts add", () => {
  it("decodes a gate result whose build lane has no side A for a model side A predates", () => {
    expect(
      Schema.decodeUnknownSync(gateResult)(resultOf(recordedMacRun()))
        .observations
    ).not.toHaveLength(0);
  });

  it("records a new eligible run with the facts its admission rests on", () => {
    const admission = admitted((result) => result);
    expect(admission.kind).toBe("recorded");
    expect(admission).toMatchObject({
      run: {
        b: recordedMacRun().b,
        cpu: "Apple M4 Pro",
        load: recordedMacRun().load,
        mode: "gate",
        protocol: recordedMacRun().protocol,
      },
    });
  });

  it("says a run with the same comparisonId and readings is already recorded", () => {
    expect(
      admit(
        resultOf(recordedMacRun()),
        [mac],
        macRecording,
        "a renamed copy",
        currentProtocol
      )
    ).toStrictEqual({ id: NEWEST_MAC_RUN, kind: "already recorded" });
  });

  it("refuses a result that conflicts with the recorded run of its comparisonId", () => {
    const run = recordedMacRun();
    const admission = admit(
      {
        ...resultOf(run),
        observations: resultOf(run).observations.map((each) =>
          each.metric === "room.tick.p95" ? { ...each, value: 1 } : each
        ),
      },
      [mac],
      macRecording,
      "test",
      currentProtocol
    );
    expect(admission).toMatchObject({
      kind: "refused",
      problems: [expect.stringContaining("conflicts")],
    });
  });

  const linux: ChildRuntime = {
    runtime: {
      arch: "x64",
      cpu: "AMD EPYC 7763 64-Core Processor",
      platform: "linux",
    },
  };

  it.each([
    [
      "a baseline run",
      (result: GateResult) => ({ ...result, mode: "baseline" }),
      [mac],
      "only gate runs",
    ],
    [
      "a run with no load verdict",
      (result: GateResult) => ({ ...result, load: { limit: 9, peak: 99 } }),
      [mac],
      "has no verdict",
    ],
    [
      "a run that failed as evidence",
      (result: GateResult) => ({
        ...result,
        evidence: ["FAIL harness A=first B=second ran different harnesses"],
      }),
      [mac],
      "failed as evidence",
    ],
    [
      "a run of uncommitted side-B code",
      (result: GateResult) => ({
        ...result,
        sides: { ...result.sides, B: { ...result.sides.B, dirty: true } },
      }),
      [mac],
      "uncommitted",
    ],
    [
      "a run measured under another protocol",
      (result: GateResult) => ({ ...result, protocol: "0".repeat(64) }),
      [mac],
      "under protocol",
    ],
    [
      "a run against another side A",
      (result: GateResult) => ({
        ...result,
        sides: { ...result.sides, A: { revision: "0".repeat(40) } },
      }),
      [mac],
      "measured side A",
    ],
    [
      "a run whose children disagree on the CPU",
      (result: GateResult) => result,
      [
        mac,
        { runtime: { ...mac.runtime, cpu: "AMD EPYC 7763 64-Core Processor" } },
      ],
      "disagree on the CPU",
    ],
    [
      "a run whose children ran on another environment",
      (result: GateResult) => result,
      [linux],
      "is filed for node-darwin-arm64",
    ],
  ] as const)("refuses %s", (_case, change, children, problem) => {
    const admission = admitted(change, children);
    expect(
      admission.kind === "refused"
        ? admission.problems.filter((each) => each.includes(problem))
        : admission
    ).toHaveLength(1);
  });
});
