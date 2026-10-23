import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { effectModules, namespaceNames } from "../effect-names.ts";

const rootName = (node: ESTree.Node): string | null => {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "MemberExpression") {
    return rootName(node.object);
  }
  if (node.type === "CallExpression") {
    return rootName(node.callee);
  }
  if (node.type === "ParenthesizedExpression") {
    return rootName(node.expression);
  }
  return null;
};

export const noFloatingEffectRule = defineRule({
  create(context) {
    const effectNames = new Set<string>();
    return {
      ExpressionStatement(node) {
        const { expression } = node;
        if (
          expression.type !== "CallExpression" ||
          expression.callee.type !== "MemberExpression"
        ) {
          return;
        }
        const name = rootName(expression);
        if (name !== null && effectNames.has(name)) {
          context.report({ messageId: "floating", node });
        }
      },
      ImportDeclaration(node) {
        for (const name of namespaceNames(node, effectModules, "Effect")) {
          effectNames.add(name);
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow an Effect built as a statement and then dropped; nothing runs it.",
    },
    messages: {
      floating:
        "This Effect is built and dropped, so it never runs. `yield*` it, return it, or compose it into the caller.",
    },
    type: "problem",
  },
});
