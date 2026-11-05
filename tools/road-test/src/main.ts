import path from "node:path";
import { pathToFileURL } from "node:url";

import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import type { TrackPlan } from "@racer/track/track";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Predicate from "effect/Predicate";
import { TaggedError as TaggedErrorClass } from "effect/Schema";
import * as Schema from "effect/Schema";

import { readOptions } from "./options.ts";
import type { Options } from "./options.ts";
import { runRace } from "./race.ts";
import { summarize, tierLines } from "./report.ts";
import { windowsOf } from "./tally.ts";

class PlanRejected extends TaggedErrorClass<PlanRejected>()("PlanRejected", {
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

const decodePlanModule = Schema.decodeUnknownEffect(
  Schema.Struct({
    default: Schema.declare(
      (input): input is TrackPlan =>
        Predicate.hasProperty(input, "districts") &&
        Predicate.hasProperty(input, "pieces")
    ),
  })
);

const rejected = (message: string) => (cause: unknown) =>
  new PlanRejected({ cause, message });

export const loadPlan = Effect.fn("roadTest.loadPlan")(function* loadPlan(
  file: string
) {
  const url = pathToFileURL(path.resolve(file)).href;
  const loaded: unknown = yield* Effect.tryPromise({
    catch: rejected(`Cannot import --plan ${file}.`),
    try: async () => {
      const imported: unknown = await import(url);
      return imported;
    },
  });
  const planModule = yield* decodePlanModule(loaded).pipe(
    Effect.mapError(
      rejected(`--plan ${file} must export a TrackPlan as default.`)
    )
  );
  return planModule.default;
});

const compile = (plan: TrackPlan, source: string) =>
  Effect.try({
    catch: rejected(`${source} does not hold a TrackPlan that compiles.`),
    try: () => compileTrack(plan),
  });

const print = (lines: readonly string[]) =>
  Effect.sync(() => process.stdout.write(`${lines.join("\n")}\n`));

const headerLines = (options: Options, plan: TrackPlan): readonly string[] => [
  `Road test: ${plan.name} (${options.plan ?? options.road}), ${options.seeds.length} seeds, ${options.field} field, pacing ${options.pacing}.`,
  "Conditions are difficulties[tier].conditions. Police count is 0 in every race, and a race with police behaves differently. The player is controller pilot.",
];

export const roadTest = Effect.fn("roadTest.run")(function* roadTest(
  args: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const options = yield* readOptions(args);
  const plan =
    options.plan === undefined
      ? roads[options.road]
      : yield* loadPlan(options.plan);
  const track = yield* compile(plan, options.plan ?? options.road);
  const windows = windowsOf(plan.districts, track.length);
  yield* print(headerLines(options, plan));
  const reports = [];
  for (const tier of options.tiers) {
    const started = yield* Clock.currentTimeMillis;
    const report = summarize(
      tier,
      windows,
      options.seeds.map((seed) =>
        runRace({
          field: options.field,
          pacing: options.pacing,
          road: options.road,
          seed,
          tier,
          track,
          windows,
        })
      )
    );
    const finished = yield* Clock.currentTimeMillis;
    yield* print(tierLines(report, (finished - started) / 1000));
    reports.push(report);
  }
  if (options.out !== undefined) {
    yield* fs.writeFileString(
      options.out,
      `${JSON.stringify(
        {
          controller: "pilot",
          field: options.field,
          pacing: options.pacing,
          plan: options.plan ?? null,
          policeCount: 0,
          road: options.road,
          seeds: options.seeds,
          tiers: reports,
        },
        null,
        1
      )}\n`
    );
  }
});
