import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { literalText, memberName, moduleName } from "../property-name.ts";

const discarded = (call: ESTree.CallExpression) => {
  const result = call.parent.type === "AwaitExpression" ? call.parent : call;
  const { parent } = result;
  return (
    parent.type === "ExpressionStatement" ||
    (parent.type === "UnaryExpression" && parent.operator === "void")
  );
};

export const noDiscardedExitRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);

    const check = (callee: ESTree.Node) => {
      const call = callee.parent;
      if (call?.type !== "CallExpression" || call.callee !== callee) {
        return;
      }
      const [, event] = call.arguments;
      if (
        event !== undefined &&
        literalText(event, raw(event)) === "exit" &&
        discarded(call)
      ) {
        context.report({ messageId: "discarded", node: call });
      }
    };

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "node:events") {
          return;
        }
        for (const specifier of node.specifiers) {
          const named = specifier.type === "ImportSpecifier";
          if (named && moduleName(specifier.imported) !== "once") {
            continue;
          }
          for (const variable of context.sourceCode.getDeclaredVariables(
            specifier
          )) {
            for (const { identifier } of variable.references) {
              const { parent } = identifier;
              if (named) {
                check(identifier);
              } else if (
                parent.type === "MemberExpression" &&
                parent.object === identifier &&
                memberName(parent, raw) === "once"
              ) {
                check(parent);
              }
            }
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow waiting for a worker or child process to exit and discarding its exit code.",
    },
    messages: {
      discarded:
        'This waits for "exit" and drops the exit code, so a worker that fails still looks finished. Bind the result and throw when the code is not 0.',
    },
    type: "problem",
  },
});
