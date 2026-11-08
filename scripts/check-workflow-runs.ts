import { readFileSync } from "node:fs";
import process from "node:process";

import * as Predicate from "effect/Predicate";
import {
  isMap,
  isNode,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
} from "yaml";
import type { Document, Node } from "yaml";

import { repositoryFiles } from "./git-files.ts";

const TRIGGER = "workflow_run";

interface Workflow {
  readonly document: Document.Parsed;
  readonly file: string;
  readonly lines: LineCounter;
}

interface Trigger {
  readonly key: Node;
  readonly value: Node | null;
}

const workflows: readonly Workflow[] = repositoryFiles(".", [
  ".github/workflows/*.yml",
  ".github/workflows/*.yaml",
]).map((file) => {
  const lines = new LineCounter();
  return {
    document: parseDocument(readFileSync(file, "utf-8"), {
      lineCounter: lines,
    }),
    file,
    lines,
  };
});

const where = (workflow: Workflow, node: Node): string => {
  const { col, line } = workflow.lines.linePos(node.range?.[0] ?? 0);
  return `${workflow.file}:${line}:${col}`;
};

const nameOf = (workflow: Workflow): string => {
  const name = workflow.document.get("name");
  return Predicate.isString(name) ? name : workflow.file;
};

const names = new Set(workflows.map(nameOf));

const triggerOf = (workflow: Workflow): Trigger | null => {
  const on = workflow.document.get("on", true);
  if (isMap(on)) {
    const pair = on.items.find(
      (item) => isScalar(item.key) && item.key.value === TRIGGER
    );
    return pair !== undefined && isScalar(pair.key)
      ? { key: pair.key, value: isNode(pair.value) ? pair.value : null }
      : null;
  }
  if (isSeq(on)) {
    const item = on.items.find(
      (entry) => isScalar(entry) && entry.value === TRIGGER
    );
    return isScalar(item) ? { key: item, value: null } : null;
  }
  return isScalar(on) && on.value === TRIGGER ? { key: on, value: null } : null;
};

const watchedBy = (trigger: Trigger): readonly Node[] => {
  const listed = isMap(trigger.value)
    ? trigger.value.get("workflows", true)
    : null;
  return isSeq(listed) ? listed.items.filter(isNode) : [];
};

const problemsIn = (workflow: Workflow): readonly string[] => {
  const unreadable = workflow.document.errors.map((error) => {
    const [start] = error.linePos ?? [{ col: 1, line: 1 }];
    return `${workflow.file}:${start.line}:${start.col}: ${error.message.split("\n")[0]}`;
  });
  const trigger = triggerOf(workflow);
  if (trigger === null) {
    return unreadable;
  }
  const watched = watchedBy(trigger);
  if (watched.length === 0) {
    return [
      ...unreadable,
      `${where(workflow, trigger.key)}: \`workflow_run\` lists no workflows, so this workflow never runs. Name the workflow it follows under \`workflows:\`.`,
    ];
  }
  return [
    ...unreadable,
    ...watched.flatMap((entry) => {
      const name =
        isScalar(entry) && Predicate.isString(entry.value) ? entry.value : null;
      if (name === null) {
        return [
          `${where(workflow, entry)}: \`workflow_run\` lists an entry under \`workflows:\` that is not a workflow name.`,
        ];
      }
      return names.has(name)
        ? []
        : [
            `${where(workflow, entry)}: \`workflow_run\` waits for "${name}", and no workflow under .github/workflows has that name, so this workflow never runs. The names are: ${[...names].join(", ")}.`,
          ];
    }),
  ];
};

const problems = workflows.flatMap(problemsIn);

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `Workflow runs: ok (${workflows.length} workflow files, ${names.size} names)\n`
);
