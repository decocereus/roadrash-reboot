import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import * as Schema from "effect/Schema";

import { repositoryFiles } from "./git-files.ts";
import { routedRuleDocs, routesIn, ruleChecksIn } from "./rule-routes.ts";

const routeFile = "AGENTS.md";
const rowLedgerFile = "scripts/rule-rows.json";
const rowLedger = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Number))
);
const manifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) })
  )
);

const files = repositoryFiles(".");
const routes = routesIn(readFileSync(routeFile, "utf-8"));
const ruleDocs = routedRuleDocs(routes);
const designDocs = new Set(routes.flatMap((route) => route.design));
const problems: string[] = [];

if (
  !routes.some((route) => route.paths.includes("**") && route.rules.length > 0)
) {
  problems.push(
    `${routeFile}: no route sends \`**\` to a rule doc, so no rule doc is read for every change`
  );
}

for (const pattern of new Set(routes.flatMap((route) => route.paths))) {
  if (!files.some((file) => path.matchesGlob(file, pattern))) {
    problems.push(
      `${routeFile}: the route \`${pattern}\` matches no file; point it at the paths it covers now`
    );
  }
}

const checksIn = new Map(
  files
    .filter((file) => file.endsWith(".md"))
    .map((file) => [file, ruleChecksIn(readFileSync(file, "utf-8"))] as const)
);

for (const doc of ruleDocs) {
  const checks = checksIn.get(doc);
  if (checks === undefined) {
    problems.push(`${routeFile}: the rule doc \`${doc}\` does not exist`);
  } else if (checks.length === 0) {
    problems.push(
      `${routeFile}: \`${doc}\` is in the Rules column but holds no rule row`
    );
  }
}

const recordedRows = rowLedger(readFileSync(rowLedgerFile, "utf-8"));

for (const doc of new Set([...ruleDocs, ...Object.keys(recordedRows)])) {
  const counted = checksIn.get(doc)?.length ?? 0;
  const recorded = recordedRows[doc] ?? 0;
  if (counted !== recorded) {
    problems.push(
      `${doc}: holds ${counted} rule rows but ${rowLedgerFile} records ${recorded}; a row was added, moved or deleted, so change the count in the same change only if that was meant`
    );
  }
}

for (const doc of designDocs) {
  if (!checksIn.has(doc)) {
    problems.push(`${routeFile}: the design doc \`${doc}\` does not exist`);
  }
}

for (const [file, checks] of checksIn) {
  if (checks.length > 0 && !ruleDocs.includes(file)) {
    problems.push(
      `${file}: holds ${checks.length} rule rows but no route in ${routeFile} lists it under Rules, so no agent is sent to read them`
    );
  }
}

const named = new Set(
  ruleDocs.flatMap((doc) =>
    (checksIn.get(doc) ?? []).flatMap((check) =>
      check
        .replaceAll("`", "")
        .split(",")
        .map((part) => part.trim())
    )
  )
);
const checkScripts = Object.keys(
  manifest(readFileSync("package.json", "utf-8")).scripts
).filter((script) => script.startsWith("check:"));

for (const script of checkScripts) {
  if (!named.has(`pnpm ${script}`)) {
    problems.push(
      `package.json: \`pnpm ${script}\` is a check that no rule row names; give its rule a row in the doc for its paths`
    );
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `Rule routes: ok (${routes.length} routes, ${ruleDocs.length} rule docs, ${checkScripts.length} checks named)\n`
);
