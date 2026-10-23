import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { effectModules, namespaceNames } from "../effect-names.ts";
import { memberName } from "../property-name.ts";

const isExported = (node: ESTree.Node) =>
  node.parent?.type === "VariableDeclarator" &&
  node.parent.parent?.parent?.type === "ExportNamedDeclaration";

const isServiceMethod = (node: ESTree.Node) => {
  const call = node.parent?.parent?.parent;
  return (
    node.parent?.type === "Property" &&
    node.parent.parent?.type === "ObjectExpression" &&
    call?.type === "CallExpression" &&
    call.callee.type === "MemberExpression" &&
    call.callee.property.type === "Identifier" &&
    call.callee.property.name === "of"
  );
};

export const preferEffectFnRule = defineRule({
  create(context) {
    const effectNames = new Set<string>();
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);

    const isEffectGen = (node: ESTree.Node) =>
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.object.type === "Identifier" &&
      effectNames.has(node.callee.object.name) &&
      memberName(node.callee, raw) === "gen";

    return {
      ArrowFunctionExpression(node) {
        if (
          node.body.type !== "BlockStatement" &&
          isEffectGen(node.body) &&
          (isExported(node) || isServiceMethod(node))
        ) {
          context.report({ messageId: "named", node });
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
        "Require exported operations and service methods built from Effect.gen to use Effect.fn.",
    },
    messages: {
      named:
        'Write this operation as `Effect.fn("module.operation")(function* (...) { ... })` so it gets a span and a name in traces.',
    },
    type: "suggestion",
  },
});
