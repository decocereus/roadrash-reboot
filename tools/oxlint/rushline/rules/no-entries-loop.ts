import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope } from "@oxlint/plugins";

import { memberName } from "../property-name.ts";

const enclosingFunction = (node: ESTree.Node): ESTree.Node | null => {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression"
    ) {
      return current;
    }
  }
  return null;
};

export const noEntriesLoopRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    const isEntriesCall = (node: ESTree.Node | null): boolean =>
      node?.type === "CallExpression" &&
      node.arguments.length === 0 &&
      node.callee.type === "MemberExpression" &&
      memberName(node.callee, raw) === "entries";
    const holdsEntries = (
      identifier: ESTree.IdentifierReference,
      loop: ESTree.ForOfStatement
    ): boolean => {
      for (
        let scope: Scope | null = context.sourceCode.getScope(identifier);
        scope !== null;
        scope = scope.upper
      ) {
        const variable = scope.set.get(identifier.name);
        if (variable) {
          const declarator = variable.defs[0]?.node;
          return (
            variable.defs.length === 1 &&
            declarator?.type === "VariableDeclarator" &&
            declarator.parent.type === "VariableDeclaration" &&
            declarator.parent.kind === "const" &&
            isEntriesCall(declarator.init) &&
            enclosingFunction(declarator) === enclosingFunction(loop)
          );
        }
      }
      return false;
    };
    return {
      ForOfStatement(node) {
        const { right } = node;
        if (
          isEntriesCall(right) ||
          (right.type === "Identifier" && holdsEntries(right, node))
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
        "Iterating entries() builds an iterator and a pair for every element. Read an array or typed array by index, and walk a Map, a Set or any other collection with a traversal that suits it.",
    },
    type: "problem",
  },
});
