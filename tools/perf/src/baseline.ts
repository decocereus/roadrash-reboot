import * as Schema from "effect/Schema";

import type { Budgets } from "./budgets.ts";
import { scenarioHash, scenarios } from "./scenarios.ts";

const window = Schema.Struct({ from: Schema.Number, to: Schema.Number });

const summaryScenario = Schema.Struct({
  hash: Schema.String,
  id: Schema.String,
  police: Schema.Number,
  race: Schema.String,
  racers: Schema.Number,
  window,
  workloadDigest: Schema.String,
});

const summaryRun = Schema.Struct({
  environment: Schema.String,
  facts: Schema.Record(Schema.String, Schema.String),
  id: Schema.String,
  lanes: Schema.Array(Schema.String),
  sides: Schema.Struct({ A: Schema.String, B: Schema.String }),
});

const summaryObservation = Schema.Struct({
  environment: Schema.String,
  metric: Schema.String,
  scenario: Schema.NullOr(Schema.String),
  side: Schema.Literals(["A", "B", "A+B"]),
  source: Schema.String,
  value: Schema.Number,
});

export const baselineSummary = Schema.Struct({
  harnessDigest: Schema.String,
  observations: Schema.Array(summaryObservation),
  revisions: Schema.Struct({
    instrumented: Schema.String,
    parent: Schema.String,
  }),
  runs: Schema.Array(summaryRun),
  scenarios: Schema.Array(summaryScenario),
  trackCompile: Schema.Struct({
    method: Schema.String,
    ms: Schema.Number,
    tracks: Schema.Number,
  }),
  version: Schema.Literal(1),
});

type BaselineSummary = typeof baselineSummary.Type;

const scenarioProblems = (summary: BaselineSummary): string[] =>
  scenarios.flatMap((scenario) => {
    const recorded = summary.scenarios.find((each) => each.id === scenario.id);
    const hash = scenarioHash(scenario);
    if (!recorded) {
      return [`the baseline has no scenario ${scenario.id}`];
    }
    return recorded.hash === hash &&
      recorded.window.from === scenario.window.from &&
      recorded.window.to === scenario.window.to &&
      recorded.workloadDigest === scenario.workloadDigest
      ? []
      : [
          `the baseline measured ${scenario.id} as ${recorded.hash.slice(0, 12)} ${recorded.window.from}-${recorded.window.to}; the registry has ${hash.slice(0, 12)} ${scenario.window.from}-${scenario.window.to}: measure a new baseline`,
        ];
  });

export const summaryProblems = (
  summary: BaselineSummary,
  budgets: Budgets
): string[] => {
  const runs = new Set(summary.runs.map((run) => run.id));
  const unknownRun = (where: string, source: string): string[] =>
    runs.has(source)
      ? []
      : [`${where} names run ${source}, not in the baseline`];
  const limitProblems = budgets.limits.flatMap((limit) => {
    const where = `limit ${limit.metric}|${limit.scenario ?? "-"}|${limit.environment}`;
    const recorded = summary.observations.find(
      (each) =>
        each.metric === limit.metric &&
        each.scenario === limit.scenario &&
        each.environment === limit.environment &&
        each.source === limit.source
    );
    if (!recorded) {
      return [`${where} has no baseline observation from ${limit.source}`];
    }
    return [
      ...unknownRun(where, limit.source),
      ...(recorded.value === limit.baseline
        ? []
        : [
            `${where} baseline ${limit.baseline} differs from the observed ${recorded.value}`,
          ]),
    ];
  });
  const profileProblems = Object.entries(budgets.nodeProfiles).flatMap(
    ([name, profile]) => unknownRun(`node profile ${name}`, profile.source)
  );
  return [
    ...(budgets.baseline.revision === summary.revisions.instrumented
      ? []
      : [
          `budgets name A=${budgets.baseline.revision}, the baseline measured ${summary.revisions.instrumented}`,
        ]),
    ...scenarioProblems(summary),
    ...limitProblems,
    ...profileProblems,
  ];
};
