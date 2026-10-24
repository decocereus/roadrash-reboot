import type { ESTree } from "@oxlint/plugins";

export type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

export const isFunction = (node: ESTree.Node): node is FunctionNode =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression";

export const enclosingFunction = (node: ESTree.Node): FunctionNode | null => {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (isFunction(current)) {
      return current;
    }
  }
  return null;
};
