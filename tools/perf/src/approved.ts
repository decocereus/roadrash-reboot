import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { baselineSummary, summaryProblems } from "./baseline.ts";
import { budgetProblems, budgetsFile } from "./budgets.ts";
import { ConfigInvalid } from "./config-invalid.ts";
import { sha256Of } from "./result.ts";

const decodeBudgets = Schema.decodeUnknownEffect(
  Schema.fromJsonString(budgetsFile)
);

const decodeSummary = Schema.decodeUnknownEffect(
  Schema.fromJsonString(baselineSummary)
);

const unreadable = (file: string) => (cause: unknown) =>
  new ConfigInvalid({ cause, message: `Cannot read ${file}.` });

export const readBudgets = Effect.fnUntraced(function* readBudgets(
  file: string
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.mapError(unreadable(file)));
  const budgets = yield* decodeBudgets(text).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigInvalid({ cause, message: `${file} is not a budgets file.` })
    )
  );
  const problems = budgetProblems(budgets);
  if (problems.length > 0) {
    return yield* new ConfigInvalid({
      message: `${file} is incomplete:\n${problems.join("\n")}`,
    });
  }
  return { budgets, sha256: sha256Of(text) };
});

const hashProblem = Effect.fnUntraced(function* hashProblem(
  root: string,
  file: string,
  expected: string
) {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs
    .readFile(path.join(root, file))
    .pipe(Effect.mapError(unreadable(file)));
  const actual = sha256Of(bytes);
  return actual === expected
    ? null
    : `${file} has sha256 ${actual.slice(0, 12)}, the budgets record ${expected.slice(0, 12)}`;
});

export const checkApproved = Effect.fnUntraced(function* checkApproved(
  root: string,
  file: string
) {
  const fs = yield* FileSystem.FileSystem;
  const { budgets } = yield* readBudgets(file);
  const { baseline } = budgets;
  const hashes = [
    yield* hashProblem(root, baseline.summary, baseline.summarySha256),
  ];
  for (const raw of baseline.raw) {
    hashes.push(yield* hashProblem(root, raw.file, raw.sha256));
  }
  const summary = yield* fs
    .readFileString(path.join(root, baseline.summary))
    .pipe(
      Effect.flatMap(decodeSummary),
      Effect.mapError(
        (cause) =>
          new ConfigInvalid({
            cause,
            message: `${baseline.summary} is not a baseline summary.`,
          })
      )
    );
  const problems = [
    ...hashes.filter((each) => each !== null),
    ...summaryProblems(summary, budgets),
  ];
  if (problems.length > 0) {
    return yield* new ConfigInvalid({
      message: `${file} does not match its baseline:\n${problems.join("\n")}`,
    });
  }
  return [
    `ok   perf budgets ${path.relative(root, file)}: ${budgets.limits.length} limits, node profiles ${Object.keys(budgets.nodeProfiles).toSorted().join(", ")}, A=${baseline.revision.slice(0, 12)}`,
    `ok   perf baseline ${baseline.summary} and ${baseline.raw.length} raw files match their hashes, the registry and every limit`,
  ];
});
