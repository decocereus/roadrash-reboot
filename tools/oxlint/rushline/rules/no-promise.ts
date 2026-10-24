import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { enclosingFunction, isFunction } from "../functions.ts";
import type { FunctionNode } from "../functions.ts";
import { memberName } from "../property-name.ts";

const promiseTypes = new Set(["Promise", "PromiseLike"]);
const boundaryMethods = new Set(["promise", "tryPromise"]);

const isBoundaryCall = (node: ESTree.Node) =>
  node.type === "CallExpression" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  boundaryMethods.has(node.callee.property.name);

const isBoundaryThunk = (node: FunctionNode) => {
  const { parent } = node;
  if (isBoundaryCall(parent)) {
    return true;
  }
  return (
    parent.type === "Property" &&
    parent.key.type === "Identifier" &&
    parent.key.name === "try" &&
    parent.parent.type === "ObjectExpression" &&
    isBoundaryCall(parent.parent.parent)
  );
};

const insideBoundary = (node: ESTree.Node) => {
  let current: ESTree.Node | null = node;
  while (current !== null && current.type !== "Program") {
    if (isFunction(current) && isBoundaryThunk(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

export const noPromiseRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    const report = (node: ESTree.Node, what: string) => {
      if (!insideBoundary(node)) {
        context.report({ data: { what }, messageId: "promise", node });
      }
    };
    const checkFunction = (node: FunctionNode) => {
      if (node.async) {
        report(node, "An async function");
      }
    };
    return {
      ArrowFunctionExpression: checkFunction,
      AwaitExpression(node) {
        if (enclosingFunction(node) === null) {
          report(node, "A top-level await");
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          memberName(node.callee, raw) === "then"
        ) {
          report(node, "A `.then` chain");
        }
      },
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          node.object.name === "Promise"
        ) {
          report(node, "A `Promise` static call");
        }
      },
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "Promise"
        ) {
          report(node, "`new Promise`");
        }
      },
      TSTypeReference(node) {
        if (
          node.typeName.type === "Identifier" &&
          promiseTypes.has(node.typeName.name)
        ) {
          report(node, `A \`${node.typeName.name}\` type`);
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow Promise code in tool modules outside Effect.promise and Effect.tryPromise thunks.",
    },
    messages: {
      promise:
        "{{what}} is Promise code. Return an Effect; wrap a third-party Promise in `Effect.tryPromise`.",
    },
    type: "problem",
  },
});
