import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { memberName } from "../property-name.ts";

export const noEntriesLoopRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    return {
      ForOfStatement(node) {
        const { right } = node;
        if (
          right.type === "CallExpression" &&
          right.arguments.length === 0 &&
          right.callee.type === "MemberExpression" &&
          memberName(right.callee, raw) === "entries"
        ) {
          context.report({ messageId: "entries", node: right });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow for...of over .entries() in the simulation and the renderer.",
    },
    messages: {
      entries:
        "This loop builds an iterator and an index-and-value pair for every element. Loop by index and read the element with `list[index]`.",
    },
    type: "problem",
  },
});
