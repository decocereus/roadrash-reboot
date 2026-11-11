import { defineRule } from "@oxlint/plugins";

const functions = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

interface Parented {
  readonly type: string;
  readonly parent: Parented | null;
}

const insideFunction = (node: Parented): boolean => {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (functions.has(current.type)) {
      return true;
    }
  }
  return false;
};

export const noTopLevelAwaitRule = defineRule({
  create(context) {
    return {
      AwaitExpression(node) {
        if (!insideFunction(node)) {
          context.report({ messageId: "waits", node });
        }
      },
      ForOfStatement(node) {
        if (node.await && !insideFunction(node)) {
          context.report({ messageId: "waits", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow await at the top level of a module the browser loads.",
    },
    messages: {
      waits:
        "A module that waits at its top level makes every script that shares its chunk wait too, and Safari runs a second importer before the wait ends, with every import still undefined. Wait inside the async function that needs the result.",
    },
    schema: [],
    type: "problem",
  },
});
