import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { effectModules, namespaceNames } from "../effect-names.ts";
import { memberName } from "../property-name.ts";

export const preferCatchTagsRule = defineRule({
  create(context) {
    const effectNames = new Set<string>();
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);

    const isCatchTag = (node: ESTree.Node | undefined) =>
      node?.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.object.type === "Identifier" &&
      effectNames.has(node.callee.object.name) &&
      memberName(node.callee, raw) === "catchTag";

    const tagOf = (node: ESTree.Node | undefined) =>
      node?.type === "CallExpression" && node.arguments[0] !== undefined
        ? raw(node.arguments[0])
        : null;

    return {
      CallExpression(node) {
        for (const [index, argument] of node.arguments.entries()) {
          const previous = node.arguments[index - 1];
          if (
            index > 0 &&
            isCatchTag(argument) &&
            isCatchTag(previous) &&
            tagOf(argument) !== tagOf(previous)
          ) {
            context.report({ messageId: "combine", node: argument });
          }
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
        "Require one Effect.catchTags over consecutive Effect.catchTag steps.",
    },
    messages: {
      combine:
        "Consecutive `Effect.catchTag` steps handle one failure set. Merge them into `Effect.catchTags({ ... })`.",
    },
    type: "suggestion",
  },
});
