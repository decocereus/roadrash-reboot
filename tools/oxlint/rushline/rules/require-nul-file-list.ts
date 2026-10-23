import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { literalText } from "../property-name.ts";

const nulFlag = /^-[A-WYa-wy]*z[A-Za-z]*$/u;

export const requireNulFileListRule = defineRule({
  create(context) {
    const text = (node: ESTree.Node | null) =>
      node === null
        ? null
        : literalText(node, context.sourceCode.getText(node));
    return {
      ArrayExpression(node) {
        const [command = null, ...rest] = node.elements;
        if (
          text(command) === "ls-files" &&
          !rest.some((element) => nulFlag.test(text(element) ?? ""))
        ) {
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
