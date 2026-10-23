import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { literalText } from "../property-name.ts";

const valueOptions: ReadonlySet<string> = new Set([
  "--exclude",
  "--exclude-from",
  "--exclude-per-directory",
  "--format",
  "--with-tree",
]);
const shortOptions = /^-(?!-)(?<flags>[^Xx]*)(?<value>[Xx].*)?$/su;

const requestsNul = (args: readonly (string | null)[]) => {
  let valueNext = false;
  for (const arg of args) {
    if (valueNext) {
      valueNext = false;
    } else if (arg === "--") {
      return false;
    } else if (arg !== null) {
      const cluster = shortOptions.exec(arg)?.groups;
      if (cluster?.flags?.includes("z") === true) {
        return true;
      }
      valueNext = valueOptions.has(arg) || cluster?.value?.length === 1;
    }
  }
  return false;
};

export const requireNulFileListRule = defineRule({
  create(context) {
    const text = (node: ESTree.Node | null) =>
      node === null
        ? null
        : literalText(node, context.sourceCode.getText(node));
    return {
      ArrayExpression(node) {
        const [command = null, ...rest] = node.elements;
        if (text(command) === "ls-files" && !requestsNul(rest.map(text))) {
          context.report({ messageId: "displayPaths", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Require `-z` in every `git ls-files` argument list, so paths come back raw and NUL-delimited.",
    },
    messages: {
      displayPaths:
        'Pass `-z` to `git ls-files` and split its output on "\\0". Without it Git quotes paths with non-ASCII characters, quotes or tabs, and code that opens the quoted text misses the file.',
    },
    type: "problem",
  },
});
