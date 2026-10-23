import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { defineRule } from "@oxlint/plugins";

import { commentLines, safetyNotes } from "../notes.ts";

const testFiles = "{apps,packages,tools}/**/*.test.{ts,tsx}";
const testTitle = /\b(?:it|test)\(\s*(?<quote>["'`])(?<title>.*?)\k<quote>/gsu;
const verifiedBy = /^Verified by:\s*(?<title>\S.*)$/u;

const titlesByRoot = new Map<string, ReadonlySet<string>>();

const testTitles = (root: string): ReadonlySet<string> => {
  const known = titlesByRoot.get(root);
  if (known !== undefined) {
    return known;
  }
  const titles = new Set(
    globSync(testFiles, {
      cwd: root,
      exclude: (entry) => entry.split("/").includes("node_modules"),
    }).flatMap((file) =>
      [...readFileSync(path.join(root, file), "utf-8").matchAll(testTitle)].map(
        (match) => match.groups?.title ?? ""
      )
    )
  );
  titlesByRoot.set(root, titles);
  return titles;
};

export const safetyVerifiedByRule = defineRule({
  create(context) {
    return {
      Program() {
        const notes = safetyNotes(
          context.sourceCode.text,
          context.sourceCode.getAllComments()
        );
        for (const note of notes) {
          const title = note.comments
            .flatMap(commentLines)
            .map((line) => verifiedBy.exec(line)?.groups?.title)
            .find((found) => found !== undefined);
          if (title === undefined) {
            context.report({ loc: note.first.loc, messageId: "missing" });
          } else if (!testTitles(context.cwd).has(title)) {
            context.report({
              data: { title },
              loc: note.first.loc,
              messageId: "unknownTest",
            });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Require every SAFETY note to name, on a `Verified by:` line, a test that fails when its invariant breaks.",
    },
    messages: {
      missing:
        "End this SAFETY note with a `Verified by: <test title>` line naming the test that fails when the invariant breaks.",
      unknownTest:
        "No test titled `{{title}}` exists under apps/, packages/ or tools/. Name an existing `it` or `test` title.",
    },
    type: "problem",
  },
});
