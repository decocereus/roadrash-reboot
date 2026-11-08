import { readFileSync } from "node:fs";
import process from "node:process";

import { repositoryFiles } from "./git-files.ts";

const topName = /^name:\s*(?<name>[^#]+?)\s*(?:#.*)?$/u;
const workflowRunKey = /^(?<indent>\s*)workflow_run:\s*(?:#.*)?$/u;
const workflowsKey =
  /^(?<indent>\s*)workflows:\s*(?:\[(?<inline>[^\]]*)\])?\s*(?:#.*)?$/u;
const listItem = /^\s*-\s*(?<entry>[^#]+?)\s*(?:#.*)?$/u;
const quoted = /^(?<quote>["'])(?<inner>.*)\k<quote>$/u;

interface Named {
  readonly line: number;
  readonly name: string;
}

const unquote = (text: string): string =>
  quoted.exec(text.trim())?.groups?.inner ?? text.trim();

const indentOf = (line: string): number =>
  line.length - line.trimStart().length;

const isContent = (line: string): boolean =>
  line.trim() !== "" && !line.trimStart().startsWith("#");

const listed = (
  lines: readonly string[],
  from: number,
  indent: number
): readonly Named[] => {
  const names: Named[] = [];
  for (let at = from; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    const entry = listItem.exec(line)?.groups?.entry;
    if (isContent(line) && (indentOf(line) < indent || entry === undefined)) {
      break;
    }
    if (entry !== undefined) {
      names.push({ line: at + 1, name: unquote(entry) });
    }
  }
  return names;
};

const watchedIn = (
  lines: readonly string[],
  from: number,
  indent: number
): readonly Named[] => {
  for (let at = from; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    if (isContent(line) && indentOf(line) <= indent) {
      return [];
    }
    const key = workflowsKey.exec(line)?.groups;
    if (key?.indent !== undefined) {
      return key.inline === undefined
        ? listed(lines, at + 1, key.indent.length)
        : key.inline
            .split(",")
            .filter((entry) => entry.trim() !== "")
            .map((entry) => ({ line: at + 1, name: unquote(entry) }));
    }
  }
  return [];
};

const workflows = repositoryFiles(".", [
  ".github/workflows/*.yml",
  ".github/workflows/*.yaml",
]).map((file) => ({ file, lines: readFileSync(file, "utf-8").split("\n") }));

const names = new Set(
  workflows.map(({ file, lines }) => {
    const named = lines
      .map((line) => topName.exec(line)?.groups?.name)
      .find(Boolean);
    return named === undefined ? file : unquote(named);
  })
);

const problems = workflows.flatMap(({ file, lines }) =>
  lines.flatMap((line, at) => {
    const trigger = workflowRunKey.exec(line)?.groups;
    if (trigger?.indent === undefined) {
      return [];
    }
    const watched = watchedIn(lines, at + 1, trigger.indent.length);
    if (watched.length === 0) {
      return [
        `${file}:${at + 1}: \`workflow_run\` lists no workflows, so this workflow never runs. Name the workflow it follows under \`workflows:\`.`,
      ];
    }
    return watched
      .filter(({ name }) => !names.has(name))
      .map(
        ({ line: number, name }) =>
          `${file}:${number}: \`workflow_run\` waits for "${name}", and no workflow under .github/workflows has that name, so this workflow never runs. The names are: ${[...names].join(", ")}.`
      );
  })
);

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `Workflow runs: ok (${workflows.length} workflow files, ${names.size} names)\n`
);
