import { readFileSync } from "node:fs";
import process from "node:process";

import * as Schema from "effect/Schema";

import config from "../oxlint.config.ts";
import { ruleLedger } from "./rule-ledger.ts";
import { routedRuleDocs, routesIn, ruleChecksIn } from "./rule-routes.ts";

const ruleDocs = routedRuleDocs(routesIn(readFileSync("AGENTS.md", "utf-8")));
const projectPlugins = /^(?:rushline|anti-slop)\//u;
const manifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) })
  )
);

const scripts = new Set(
  Object.keys(manifest(readFileSync("package.json", "utf-8")).scripts)
);

const { enabled: enabledRules, exemptions } = ruleLedger(config);

const problems = exemptions.map(
  (exemption) => `oxlint.config.ts: ${exemption}; fix the code instead`
);
const named = new Set<string>();
let rows = 0;

const checkNamed = (file: string, check: string) => {
  named.add(check);
  if (check === "judgment") {
    return;
  }
  if (check.startsWith("pnpm ")) {
    if (!scripts.has(check.slice("pnpm ".length))) {
      problems.push(`${file}: \`${check}\` is not a package.json script`);
    }
    return;
  }
  if (!enabledRules.has(check)) {
    problems.push(
      `${file}: \`${check}\` is not an enabled lint rule in oxlint.config.ts`
    );
  }
};

for (const file of ruleDocs) {
  for (const check of ruleChecksIn(readFileSync(file, "utf-8"))) {
    rows += 1;
    for (const part of check.replaceAll("`", "").split(",")) {
      checkNamed(file, part.trim());
    }
  }
}

for (const rule of enabledRules) {
  if (projectPlugins.test(rule) && !named.has(rule)) {
    problems.push(
      `oxlint.config.ts: \`${rule}\` is enabled but no row in ${ruleDocs.join(", ")} names it`
    );
  }
}

if (rows === 0) {
  problems.push(`${ruleDocs.join(", ")}: no rule tables found`);
}
if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Rules: ok (${rows} rows)\n`);
