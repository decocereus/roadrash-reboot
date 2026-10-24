import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { variableNamed } from "../bindings.ts";
import { enclosingFunction, isFunction } from "../functions.ts";
import { memberName } from "../property-name.ts";

const positionMethods = new Set([
  "at",
  "entries",
  "findIndex",
  "findLastIndex",
  "indexOf",
  "keys",
  "lastIndexOf",
  "slice",
  "splice",
  "toSpliced",
  "with",
]);

const indexAt = new Map([
  ["every", 1],
  ["filter", 1],
  ["find", 1],
  ["findLast", 1],
  ["flatMap", 1],
  ["forEach", 1],
  ["map", 1],
  ["reduce", 2],
  ["reduceRight", 2],
  ["some", 1],
]);

const riderFields = new Set([
  "by",
  "chase",
  "cop",
  "grudge",
  "id",
  "lastHitBy",
  "other",
  "rider",
  "target",
]);

const comparisons = new Set(["===", "!==", "==", "!=", "<", "<=", ">", ">="]);

const numeral = /^\.?\d/u;

const isNumber = (node: ESTree.Node): boolean =>
  (node.type === "Literal" && numeral.test(node.raw ?? "")) ||
  (node.type === "UnaryExpression" &&
    node.operator === "-" &&
    isNumber(node.argument));

export const riderByIdRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    const isRiders = (node: ESTree.Node): boolean =>
      (node.type === "Identifier" && node.name === "riders") ||
      (node.type === "MemberExpression" && memberName(node, raw) === "riders");
    const isLoopCounter = (
      property: ESTree.Node,
      access: ESTree.Node
    ): boolean => {
      if (property.type !== "Identifier") {
        return false;
      }
      const variable = variableNamed(
        context.sourceCode.getScope(property),
        property.name
      );
      const declarator = variable?.defs[0]?.node;
      const declaration = declarator?.parent;
      const loop = declaration?.parent;
      return (
        variable?.defs.length === 1 &&
        declarator?.type === "VariableDeclarator" &&
        declaration?.type === "VariableDeclaration" &&
        loop?.type === "ForStatement" &&
        loop.init === declaration &&
        enclosingFunction(loop) === enclosingFunction(access)
      );
    };
    const reportDestructured = (
      pattern: ESTree.Node,
      source: ESTree.Node | null | undefined
    ) => {
      if (pattern.type === "ArrayPattern" && source && isRiders(source)) {
        context.report({ messageId: "destructured", node: pattern });
      }
    };
    return {
      AssignmentExpression(node) {
        reportDestructured(node.left, node.right);
      },
      BinaryExpression(node) {
        if (!comparisons.has(node.operator)) {
          return;
        }
        const field = [node.left, node.right].find(
          (side) =>
            side.type === "MemberExpression" &&
            riderFields.has(memberName(side, raw) ?? "")
        );
        if (field && (isNumber(node.left) || isNumber(node.right))) {
          context.report({ messageId: "literal", node });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression" || !isRiders(callee.object)) {
          return;
        }
        const method = memberName(callee, raw) ?? "";
        if (positionMethods.has(method)) {
          context.report({ data: { method }, messageId: "position", node });
          return;
        }
        const at = indexAt.get(method);
        const [callback] = node.arguments;
        if (
          at !== undefined &&
          callback !== undefined &&
          isFunction(callback) &&
          callback.params.length > at
        ) {
          context.report({ messageId: "callbackIndex", node: callback });
        }
      },
      MemberExpression(node) {
        if (
          node.computed &&
          isRiders(node.object) &&
          memberName(node, raw) === null &&
          !isLoopCounter(node.property, node)
        ) {
          context.report({ messageId: "indexed", node });
        }
      },
      VariableDeclarator(node) {
        reportDestructured(node.id, node.init);
      },
    };
  },
  meta: {
    docs: {
      description:
        "Require riders to be named by RiderId rather than by their place in a rider array.",
    },
    messages: {
      callbackIndex:
        "A rider's place in the array is not its identity. Read rider.id instead of the callback's index.",
      destructured:
        "A rider array has no fixed places to destructure. Look the rider up by its RiderId with riderOf.",
      indexed:
        "Look a rider up by its RiderId with riderOf, or walk the array. Only the counter of the for loop walking a rider array may index it.",
      literal:
        "Compare a rider reference with a RiderId such as PLAYER_RIDER or rider.id, not with a number.",
      position:
        "{{method}} reads a rider array by place. Look the rider up by its RiderId with riderOf, or find it by what it is.",
    },
    type: "problem",
  },
});
