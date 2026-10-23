import { defineRule } from "@oxlint/plugins";
import type { ESTree, Variable } from "@oxlint/plugins";

import { variableNamed } from "../bindings.ts";
import { literalText, memberName } from "../property-name.ts";

const registrations = new Set(["setOpaqueSort", "setTransparentSort"]);
const lookups = new Set([
  "filter",
  "find",
  "findIndex",
  "get",
  "has",
  "includes",
  "indexOf",
  "localeCompare",
  "map",
  "reduce",
  "sort",
  "toSorted",
]);

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

interface Finding {
  readonly name: string;
  readonly node: ESTree.Node;
}

const isFunction = (node: ESTree.Node): node is FunctionNode =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression";

const declaredFunction = (variable: Variable): FunctionNode | null => {
  const [definition] = variable.defs;
  if (variable.defs.length !== 1 || definition === undefined) {
    return null;
  }
  const { node } = definition;
  if (definition.type === "FunctionName") {
    return isFunction(node) ? node : null;
  }
  if (
    definition.type !== "Variable" ||
    node.type !== "VariableDeclarator" ||
    node.parent.type !== "VariableDeclaration" ||
    node.parent.kind !== "const" ||
    node.init === null
  ) {
    return null;
  }
  return isFunction(node.init) ? node.init : null;
};

export const numericDrawSortRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    const comparators: FunctionNode[] = [];
    const unreadable: ESTree.Node[] = [];
    const findings: Finding[] = [];
    const calls: ESTree.IdentifierReference[] = [];

    const variableOf = (identifier: ESTree.IdentifierReference) =>
      variableNamed(context.sourceCode.getScope(identifier), identifier.name);

    const register = (call: ESTree.CallExpression) => {
      const [argument] = call.arguments;
      if (argument === undefined) {
        unreadable.push(call);
        return;
      }
      if (argument.type === "Literal" && argument.value === null) {
        return;
      }
      if (isFunction(argument)) {
        comparators.push(argument);
        return;
      }
      const variable =
        argument.type === "Identifier" ? variableOf(argument) : null;
      const comparator = variable ? declaredFunction(variable) : null;
      if (comparator) {
        comparators.push(comparator);
      } else {
        unreadable.push(argument);
      }
    };

    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type === "Identifier") {
          calls.push(callee);
          return;
        }
        if (callee.type !== "MemberExpression") {
          return;
        }
        const name = memberName(callee, raw) ?? "";
        if (registrations.has(name)) {
          register(node);
        } else if (lookups.has(name)) {
          findings.push({ name, node: callee.property });
        }
      },
      MemberExpression(node) {
        if (memberName(node, raw) === "uuid") {
          findings.push({ name: "uuid", node: node.property });
        }
      },
      ObjectPattern(node) {
        for (const property of node.properties) {
          if (property.type !== "Property") {
            continue;
          }
          const key =
            !property.computed && property.key.type === "Identifier"
              ? property.key.name
              : literalText(property.key, raw(property.key));
          if (key === "uuid") {
            findings.push({ name: "uuid", node: property.key });
          }
        }
      },
      "Program:exit"() {
        const reached = new Set<ESTree.Node>(comparators);
        const inReached = (node: ESTree.Node) => {
          for (
            let current: ESTree.Node | null = node.parent;
            current !== null;
            current = current.parent
          ) {
            if (reached.has(current)) {
              return true;
            }
          }
          return false;
        };
        const unread = new Set<ESTree.IdentifierReference>();
        let grown = true;
        while (grown) {
          grown = false;
          for (const callee of calls) {
            const variable = inReached(callee) ? variableOf(callee) : null;
            if (variable === null || variable.defs.length === 0) {
              continue;
            }
            const helper = declaredFunction(variable);
            if (helper === null) {
              unread.add(callee);
            } else if (!reached.has(helper)) {
              reached.add(helper);
              grown = true;
            }
          }
        }
        for (const node of unreadable) {
          context.report({ messageId: "unreadable", node });
        }
        for (const callee of unread) {
          context.report({
            data: { name: callee.name },
            messageId: "unreadableHelper",
            node: callee,
          });
        }
        for (const { name, node } of findings) {
          if (inReached(node)) {
            context.report({
              data: { name },
              messageId: name === "uuid" ? "uuid" : "lookup",
              node,
            });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Keep draw-sort comparators to number comparisons, without uuid strings, lookups or array walks.",
    },
    messages: {
      lookup:
        "This draw-sort comparator calls `{{name}}`, a string comparison, lookup or array walk that runs for every pair of render items each frame. Compare numbers the render item already carries, such as `material.id`, or compute them before the sort.",
      unreadable:
        "Pass setOpaqueSort or setTransparentSort an inline function, `null`, or a function declared in this file with `function` or `const`, so the comparison it runs can be checked.",
      unreadableHelper:
        "This draw-sort comparator calls `{{name}}`, which is not a function declared in this file, so the comparison it runs cannot be checked. Declare it in this file or inline it.",
      uuid: "This draw-sort comparator reads `.uuid`, a string compared for every pair of render items each frame. Compare `material.id` or another number on the render item.",
    },
    type: "problem",
  },
});
