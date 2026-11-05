import { readFileSync } from "node:fs";
import process from "node:process";

import { repositoryFiles } from "./git-files.ts";

const usesKey =
  /(?:^\s*(?:-\s+)?\{?|[{,])\s*(?<keyQuote>["']?)uses\k<keyQuote>\s*:\s*/gu;
const usesValue = /^(?<valueQuote>["']?)(?<target>[^\s"'#,}]+)\k<valueQuote>/u;
const pinnedTarget = /^[^@\s]+@[0-9a-f]{40}$/u;
const versionComment = /#\s*\S+\s*$/u;

const workflows = repositoryFiles(".", [".github/*.yml", ".github/*.yaml"]);

const problemsAt = (file: string, line: string, number: number) =>
  [...line.matchAll(usesKey)].flatMap((key) => {
    const target =
      usesValue.exec(line.slice(key.index + key[0].length))?.groups?.target ??
      line.trim();
    if (
      target.startsWith("./") ||
      (pinnedTarget.test(target) && versionComment.test(line))
    ) {
      return [];
    }
    return [
      `${file}:${number}: pin \`${target}\` to a full commit SHA with its version in a trailing comment, as in \`uses: actions/checkout@<40-character SHA> # v4.4.0\`. A tag can move to new code; a SHA cannot.`,
    ];
  });

const problems = workflows.flatMap((file) =>
  readFileSync(file, "utf-8")
    .split("\n")
    .flatMap((line, index) => problemsAt(file, line, index + 1))
);

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Action pins: ok (${workflows.length} workflow files)\n`);
