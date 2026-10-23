import { existsSync, readdirSync, readFileSync } from "node:fs";
import process from "node:process";

import * as Schema from "effect/Schema";

import {
  BUDGETS,
  docFilesOf,
  featureMapProblems,
  MAP,
  RECIPES,
  sourceFilesOf,
} from "./feature-map.ts";
import { features } from "./features.ts";
import { repositoryFiles } from "./git-files.ts";

const decodeBudgets = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      limits: Schema.Array(Schema.Struct({ metric: Schema.String })),
    })
  )
);

const textOf = (file: string) =>
  existsSync(file) ? readFileSync(file, "utf-8") : null;

const files = sourceFilesOf(repositoryFiles("."));

const docs = new Map<string, string>();
for (const file of docFilesOf(features)) {
  const text = textOf(file);
  if (text !== null) {
    docs.set(file, text);
  }
}

const problems = featureMapProblems(features, {
  budgets: new Set(
    decodeBudgets(readFileSync(BUDGETS, "utf-8")).limits.map(
      (limit) => limit.metric
    )
  ),
  docs,
  files,
  map: textOf(MAP),
  recipes: new Set(readdirSync(RECIPES)),
});

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `Feature map: ok (${features.length} entries own ${files.length} source files)\n`
);
