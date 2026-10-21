import { readFileSync } from "node:fs";
import process from "node:process";

import * as Schema from "effect/Schema";

import config from "../oxlint.config.ts";
import { ruleLedger } from "./rule-ledger.ts";

const ruleDocs = [
  "docs/coding-standards.md",
  "docs/errors.md",
  "docs/observability.md",
];
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

const ruleHeader =
  /^\|\s*Rule\s*\|\s*Check\s*\|\s*Scope\s*\|\s*Exemption\s*\|$/u;
const checkCell = /^\|[^|]*\|\s*(?<check>[^|]+?)\s*\|/u;

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
  let inRuleTable = false;
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    if (ruleHeader.test(line.trim())) {
      inRuleTable = true;
      continue;
    }
    const check = checkCell.exec(line)?.groups?.check;
    if (check === undefined) {
      inRuleTable = false;
      continue;
    }
    if (!inRuleTable || /^-+$/u.test(check)) {
      continue;
    }
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
