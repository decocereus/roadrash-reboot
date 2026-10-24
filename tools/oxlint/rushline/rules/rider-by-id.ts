import path from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree, Variable } from "@oxlint/plugins";

import { variableNamed } from "../bindings.ts";
import { enclosingFunction, isFunction } from "../functions.ts";
import type { FunctionNode } from "../functions.ts";
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

const simDir = `${path.sep}packages${path.sep}sim${path.sep}`;

const inLoopHeader = (node: ESTree.Node): boolean => {
  let child: ESTree.Node = node;
  for (
    let current = node.parent;
    current !== undefined && current !== null && !isFunction(current);
    current = current.parent
  ) {
    if (current.type === "ForStatement" && current.body !== child) {
      return true;
    }
    child = current;
  }
  return false;
};

const arithmetic = new Set(["+", "-", "*", "/", "%"]);

const offsetOf = (reference: ESTree.Node): ESTree.Node => {
  let node = reference;
  while (
    node.parent?.type === "BinaryExpression" &&
    arithmetic.has(node.parent.operator)
  ) {
    node = node.parent;
  }
  return node;
};

const isNumber = (node: ESTree.Node): boolean =>
  (node.type === "Literal" && numeral.test(node.raw ?? "")) ||
  (node.type === "UnaryExpression" &&
    node.operator === "-" &&
    isNumber(node.argument));

export const riderByIdRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    const handlesRiders =
      context.filename.includes(simDir) ||
      context.sourceCode.ast.body.some(
        (statement) =>
          statement.type === "ImportDeclaration" &&
          statement.source.value.startsWith("@racer/sim")
      );
    const isRiders = (node: ESTree.Node): boolean =>
      (node.type === "Identifier" && node.name === "riders") ||
      (node.type === "MemberExpression" && memberName(node, raw) === "riders");
    const counterOf = (
      property: ESTree.Node,
      access: ESTree.Node
    ): Variable | null => {
      if (property.type !== "Identifier") {
        return null;
      }
      const variable = variableNamed(
        context.sourceCode.getScope(property),
        property.name
      );
      const declarator = variable?.defs[0]?.node;
      const declaration = declarator?.parent;
      const loop = declaration?.parent;
      return variable?.defs.length === 1 &&
        declarator?.type === "VariableDeclarator" &&
        declaration?.type === "VariableDeclaration" &&
        loop?.type === "ForStatement" &&
        loop.init === declaration &&
        enclosingFunction(loop) === enclosingFunction(access)
        ? variable
        : null;
    };
    const localFunctionOf = (node: ESTree.Node): FunctionNode | null => {
      if (isFunction(node)) {
        return node;
      }
      if (node.type !== "Identifier") {
        return null;
      }
      const definition = variableNamed(
        context.sourceCode.getScope(node),
        node.name
      )?.defs[0]?.node;
      if (definition !== undefined && isFunction(definition)) {
        return definition;
      }
      return definition?.type === "VariableDeclarator" &&
        definition.init !== null &&
        isFunction(definition.init)
        ? definition.init
        : null;
    };
    const staysLocal = (reference: ESTree.Node): boolean => {
      const offset = offsetOf(reference);
      const { parent } = offset;
      if (
        (parent?.type === "MemberExpression" &&
          parent.computed &&
          parent.property === offset) ||
        inLoopHeader(offset)
      ) {
        return true;
      }
      return (
        parent?.type === "CallExpression" &&
        parent.callee !== offset &&
        localFunctionOf(parent.callee) !== null
      );
    };
    const checkedCounters = new Set<Variable>();
    const reportEscapes = (counter: Variable) => {
      if (checkedCounters.has(counter)) {
        return;
      }
      checkedCounters.add(counter);
      for (const reference of counter.references) {
        if (!staysLocal(reference.identifier)) {
          context.report({
            messageId: "counterEscapes",
            node: reference.identifier,
          });
        }
      }
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
        if (!handlesRiders || !comparisons.has(node.operator)) {
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
        if (at === undefined || callback === undefined) {
          return;
        }
        const seen = localFunctionOf(callback);
        if (seen === null) {
          context.report({ messageId: "callbackHidden", node: callback });
        } else if (seen.params.length > at) {
          context.report({ messageId: "callbackIndex", node: callback });
        }
      },
      MemberExpression(node) {
        if (
          !node.computed ||
          !isRiders(node.object) ||
          memberName(node, raw) !== null
        ) {
          return;
        }
        const counter = counterOf(node.property, node);
        if (counter === null) {
          context.report({ messageId: "indexed", node });
        } else {
          reportEscapes(counter);
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
      callbackHidden:
        "Pass a callback whose parameters this rule can see: an inline function or a function declared in this module.",
      callbackIndex:
        "A rider's place in the array is not its identity. Read rider.id instead of the callback's index.",
      counterEscapes:
        "The counter of a loop over riders may index arrays and go to a function in this module, but not leave it. Return, store or pass the rider or its RiderId instead.",
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
