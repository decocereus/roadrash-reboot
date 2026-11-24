import path from "node:path";
import { gunzipSync } from "node:zlib";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import {
  UNSCOPED_SIDE_A,
  recordedLimit,
  recordedRule,
  requiredRows,
} from "./budgets.ts";
import type { Budgets, MetricKind } from "./budgets.ts";
import { ConfigInvalid } from "./config-invalid.ts";

export const recording = Schema.Struct({
  runs: Schema.Array(
    Schema.Struct({
      cpu: Schema.String,
      excluded: Schema.optional(Schema.String),
      id: Schema.String,
      origin: Schema.String,
      scenarios: Schema.Array(
        Schema.Struct({
          paired: Schema.Record(Schema.String, Schema.Number),
          rows: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
          scenario: Schema.String,
          sideA: Schema.optional(Schema.Number),
        })
      ),
      unscoped: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
    })
  ),
  sideA: Schema.String,
});

export type Recording = typeof recording.Type;
export type RecordedRun = Recording["runs"][number];
export type Recordings = ReadonlyMap<string, Recording>;

export const recordingFile = (environment: string) =>
  `tools/perf/baselines/recorded.${environment}.json.gz`;

export interface Reading {
  readonly cpu: string;
  readonly id: string;
  readonly value: number;
}

const scenarioOf = (run: RecordedRun, scenario: string) =>
  run.scenarios.find((each) => each.scenario === scenario);

const readingOf = (
  run: RecordedRun,
  kind: MetricKind,
  scenario: string | null
): number => {
  const scoped = scenarioOf(run, scenario ?? UNSCOPED_SIDE_A);
  if (!scoped) {
    return Number.NaN;
  }
  if (kind.rule === "paired") {
    return scoped.paired[kind.metric] ?? Number.NaN;
  }
  const value =
    scenario === null
      ? run.unscoped?.[kind.metric]
      : scoped.rows?.[kind.metric];
  return (value ?? Number.NaN) / (scoped.sideA ?? Number.NaN);
};

export const readingsOf = (
  recorded: Recording,
  kind: MetricKind,
  scenario: string | null
): Reading[] =>
  recorded.runs.flatMap((run) => {
    if (run.excluded !== undefined) {
      return [];
    }
    const value = readingOf(run, kind, scenario);
    return Number.isFinite(value) ? [{ cpu: run.cpu, id: run.id, value }] : [];
  });

export interface Derived {
  readonly baseline: number;
  readonly derivation: string;
  readonly source: string;
  readonly value: number;
}

export const derive = (readings: readonly Reading[]): Derived | null => {
  let worst: Reading | null = null;
  for (const reading of readings) {
    if (worst === null || reading.value > worst.value) {
      worst = reading;
    }
  }
  if (worst === null) {
    return null;
  }
  const cpus = new Set(readings.map((reading) => reading.cpu)).size;
  return {
    baseline: worst.value,
    derivation: `${recordedRule.headroom} x the worst of ${readings.length} recorded runs on ${cpus} runner CPU${cpus === 1 ? "" : "s"}`,
    source: worst.id,
    value: worst.value * recordedRule.headroom,
  };
};

const recordingProblems = (
  budgets: Budgets,
  environment: string,
  recorded: Recording
): string[] => {
  const pin = budgets.baseline.revision;
  const pinned =
    recorded.sideA === pin
      ? []
      : [
          `${recordingFile(environment)} was recorded against side A ${recorded.sideA.slice(0, 12)}, and the gate pins A=${pin.slice(0, 12)}: re-derive the recorded limits`,
        ];
  const foreign = recorded.runs
    .filter((run) => !run.id.includes(`-${pin.slice(0, 7)}-`))
    .map(
      (run) =>
        `${recordingFile(environment)} run ${run.id} did not measure side A at ${pin.slice(0, 7)}`
    );
  const rows = requiredRows(["node"], [environment], [])
    .filter(({ kind }) => recordedLimit(kind))
    .flatMap(({ kind, scenario }) => {
      const where = `limit ${kind.metric}|${scenario ?? "-"}|${environment}`;
      const readings = readingsOf(recorded, kind, scenario);
      if (readings.length < recordedRule.floor) {
        return [
          `${where} rests on ${readings.length} recorded runs; the rule needs at least ${recordedRule.floor}`,
        ];
      }
      const expected = derive(readings);
      const limit = budgets.limits.find(
        (each) =>
          each.environment === environment &&
          each.metric === kind.metric &&
          each.scenario === scenario
      );
      if (!expected || !limit) {
        return [];
      }
      return limit.baseline === expected.baseline &&
        limit.value === expected.value &&
        limit.source === expected.source &&
        limit.derivation === expected.derivation
        ? []
        : [
            `${where} reads baseline ${limit.baseline} from ${limit.source}, value ${limit.value}, "${limit.derivation}"; the recorded runs give ${expected.baseline} from ${expected.source}, value ${expected.value}, "${expected.derivation}"`,
          ];
    });
  return [...pinned, ...foreign, ...rows];
};

export const recordedProblems = (
  budgets: Budgets,
  recordings: Recordings
): string[] =>
  Object.keys(budgets.nodeProfiles)
    .toSorted()
    .flatMap((environment) => {
      const recorded = recordings.get(environment);
      return recorded
        ? recordingProblems(budgets, environment, recorded)
        : [`${recordingFile(environment)} is missing`];
    });

const decodeRecording = Schema.decodeUnknownEffect(
  Schema.fromJsonString(recording)
);

export const readRecordings = Effect.fnUntraced(function* readRecordings(
  root: string,
  budgets: Budgets
) {
  const fs = yield* FileSystem.FileSystem;
  const entries: [string, Recording][] = [];
  for (const environment of Object.keys(budgets.nodeProfiles).toSorted()) {
    const file = recordingFile(environment);
    const bytes = yield* fs
      .readFile(path.join(root, file))
      .pipe(
        Effect.mapError(
          (cause) =>
            new ConfigInvalid({ cause, message: `Cannot read ${file}.` })
        )
      );
    const recorded = yield* decodeRecording(
      gunzipSync(bytes).toString("utf-8")
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ConfigInvalid({
            cause,
            message: `${file} is not a run recording.`,
          })
      )
    );
    entries.push([environment, recorded]);
  }
  return new Map(entries);
});
