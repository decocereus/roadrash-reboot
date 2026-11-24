import path from "node:path";
import { gunzipSync } from "node:zlib";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import type { baselineSummary } from "./baseline.ts";
import { worstRun, worstRunMetrics } from "./budgets.ts";
import type { Budgets, Limit } from "./budgets.ts";
import { ConfigInvalid } from "./config-invalid.ts";
import { snapshotTiming, stampMetric } from "./node-lane.ts";
import { scenarios } from "./scenarios.ts";

export const stampRecording = Schema.Struct({
  runs: Schema.Array(
    Schema.Struct({
      cpu: Schema.String,
      excluded: Schema.optionalKey(Schema.String),
      id: Schema.String,
      scenarios: Schema.Array(
        Schema.Struct({
          scale: Schema.Number,
          scenario: Schema.String,
          windows: Schema.Array(Schema.Array(Schema.Number)),
        })
      ),
    })
  ),
});

export type StampRun = (typeof stampRecording.Type)["runs"][number];

export const roomRecording = Schema.Struct({
  runs: Schema.Array(
    Schema.Struct({
      cpu: Schema.String,
      id: Schema.String,
      scenarios: Schema.Array(
        Schema.Struct({
          rows: Schema.Record(
            Schema.String,
            Schema.Struct({ value: Schema.Number })
          ),
          scenario: Schema.String,
        })
      ),
    })
  ),
});

export type RoomRecording = typeof roomRecording.Type;
type StampRecording = typeof stampRecording.Type;

export interface Recordings {
  readonly room: Readonly<Record<string, RoomRecording>>;
  readonly stamp: Readonly<Record<string, StampRecording>>;
}

interface Recorded {
  readonly cpu: string;
  readonly id: string;
  readonly value: number;
}

const roomFile = (environment: string) =>
  `tools/perf/baselines/room.${environment}.json.gz`;

const stampFile = (environment: string) =>
  `tools/perf/baselines/stamp.${environment}.json.gz`;

type BaselineSummary = typeof baselineSummary.Type;

const stampValue = (
  summary: BaselineSummary,
  environment: string,
  run: StampRun,
  scenario: string
): number => {
  const observed = summary.observations.find(
    (each) =>
      each.environment === environment &&
      each.metric === stampMetric.metric &&
      each.scenario === scenario &&
      each.source === run.id
  );
  if (observed) {
    return observed.value;
  }
  const recorded = run.scenarios.find((each) => each.scenario === scenario);
  return recorded
    ? snapshotTiming(
        stampMetric,
        scenario,
        environment,
        recorded.windows,
        recorded.scale
      ).value
    : Number.NaN;
};

const recordedRuns = (
  recordings: Recordings,
  summary: BaselineSummary,
  environment: string,
  metric: string,
  scenario: string
): readonly Recorded[] =>
  metric === stampMetric.metric
    ? (recordings.stamp[environment]?.runs ?? [])
        .filter((run) => run.excluded === undefined)
        .map((run) => ({
          cpu: run.cpu,
          id: run.id,
          value: stampValue(summary, environment, run, scenario),
        }))
    : (recordings.room[environment]?.runs ?? []).map((run) => ({
        cpu: run.cpu,
        id: run.id,
        value:
          run.scenarios.find((each) => each.scenario === scenario)?.rows[metric]
            ?.value ?? Number.NaN,
      }));

const worstOf = (runs: readonly Recorded[]): Recorded | null => {
  let worst: Recorded | null = null;
  for (const run of runs) {
    if (worst === null || run.value > worst.value) {
      worst = run;
    }
  }
  return worst;
};

interface Expected {
  readonly derivation: string;
  readonly runner: string | undefined;
  readonly runs: number;
  readonly worst: Recorded;
}

const expectedLimits = (runs: readonly Recorded[]): Expected[] => {
  const worst = worstOf(runs);
  if (worst === null) {
    return [];
  }
  const cpus = [...new Set(runs.map((run) => run.cpu))].toSorted();
  const own =
    cpus.length < 2
      ? []
      : cpus.flatMap((cpu) => {
          const mine = runs.filter((run) => run.cpu === cpu);
          const worstMine = worstOf(mine);
          return worstMine !== null && mine.length >= worstRun.floor
            ? [
                {
                  derivation: worstRun.ownRunner,
                  runner: cpu,
                  runs: mine.length,
                  worst: worstMine,
                },
              ]
            : [];
        });
  return [
    {
      derivation: worstRun.everyRunner,
      runner: undefined,
      runs: runs.length,
      worst,
    },
    ...own,
  ];
};

const named = (runner: string | undefined) => runner ?? "every runner CPU";

const rowProblems = (
  where: string,
  limits: readonly Limit[],
  expected: readonly Expected[]
): string[] => [
  ...expected.flatMap(({ derivation, runner, runs, worst }) => {
    const limit = limits.find((each) => each.runner === runner);
    const wanted = `${worst.value} from ${worst.id}, the worst of ${runs} recorded runs`;
    if (!limit) {
      return [
        `${where} has no limit for ${named(runner)}; it should be ${wanted}`,
      ];
    }
    return limit.source === worst.id &&
      limit.baseline === worst.value &&
      limit.value === worst.value * worstRun.headroom &&
      limit.derivation === derivation
      ? []
      : [
          `${where} for ${named(runner)} reads baseline ${limit.baseline} from ${limit.source}, value ${limit.value}, "${limit.derivation}"; the recorded runs give ${wanted}, "${derivation}"`,
        ];
  }),
  ...limits
    .filter((limit) => !expected.some((each) => each.runner === limit.runner))
    .map(
      (limit) =>
        `${where} has a limit for ${named(limit.runner)}, which has fewer than ${worstRun.floor} recorded runs or is the only CPU recorded`
    ),
];

export const worstRunProblems = (
  budgets: Budgets,
  summary: BaselineSummary,
  recordings: Recordings
): string[] =>
  Object.keys(budgets.nodeProfiles)
    .toSorted()
    .flatMap((environment) =>
      worstRunMetrics.flatMap((metric) =>
        scenarios.flatMap((scenario) =>
          rowProblems(
            `limit ${metric}|${scenario.id}|${environment}`,
            budgets.limits.filter(
              (limit) =>
                limit.environment === environment &&
                limit.metric === metric &&
                limit.scenario === scenario.id
            ),
            expectedLimits(
              recordedRuns(
                recordings,
                summary,
                environment,
                metric,
                scenario.id
              )
            )
          )
        )
      )
    );

const readRecording = Effect.fnUntraced(function* readRecording<A>(
  root: string,
  file: string,
  schema: Schema.Codec<A, unknown>
) {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs
    .readFile(path.join(root, file))
    .pipe(
      Effect.mapError(
        (cause) => new ConfigInvalid({ cause, message: `Cannot read ${file}.` })
      )
    );
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(
    gunzipSync(bytes).toString("utf-8")
  ).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigInvalid({ cause, message: `${file} is not a run recording.` })
    )
  );
});

export const readRecordings = Effect.fnUntraced(function* readRecordings(
  root: string,
  budgets: Budgets
) {
  const environments = Object.keys(budgets.nodeProfiles).toSorted();
  const room: Record<string, RoomRecording> = {};
  const stamp: Record<string, StampRecording> = {};
  for (const environment of environments) {
    room[environment] = yield* readRecording(
      root,
      roomFile(environment),
      roomRecording
    );
    stamp[environment] = yield* readRecording(
      root,
      stampFile(environment),
      stampRecording
    );
  }
  const recordings: Recordings = { room, stamp };
  return recordings;
});
