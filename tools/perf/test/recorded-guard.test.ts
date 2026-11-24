import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { budgetsFile, recordedLimit, requiredRows } from "../src/budgets.ts";
import type { Budgets } from "../src/budgets.ts";
import { gateResult } from "../src/record.ts";
import {
  derive,
  readingsOf,
  recording,
  recordingFile,
} from "../src/recorded.ts";
import type { Recording } from "../src/recorded.ts";

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

describe("record.ts", () => {
  it("reads a gate result whose build lane has no side A for a model side A predates", () => {
    const result = {
      environment: "node-darwin-arm64",
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
      ],
      sides: { A: { revision: committed.baseline.revision } },
    };
    expect(
      Schema.decodeUnknownSync(gateResult)(result).observations
    ).toHaveLength(1);
  });
});
