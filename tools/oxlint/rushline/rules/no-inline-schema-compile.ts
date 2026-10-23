import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { variableNamed } from "../bindings.ts";
import { namespaceNames } from "../effect-names.ts";
import { memberName } from "../property-name.ts";

const schemaModules = new Set(["effect", "effect/Schema"]);
const compiler = /^(?:decode|encode|validate|is$|asserts$)/u;

const insideFunction = (node: ESTree.Node) => {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression"
    ) {
      return true;
    }
  }
  return false;
};

const identifiersIn = (node: ESTree.Node): readonly ESTree.Node[] => {
  if (node.type === "Identifier") {
    return [node];
  }
  if (node.type === "MemberExpression") {
    return identifiersIn(node.object);
  }
  if (node.type === "CallExpression") {
    return [
      ...identifiersIn(node.callee),
      ...node.arguments.flatMap((argument) => identifiersIn(argument)),
    ];
  }
  if (node.type === "ArrayExpression") {
    return node.elements.flatMap((element) =>
      element === null ? [] : identifiersIn(element)
    );
  }
  if (node.type === "ObjectExpression") {
    return node.properties.flatMap((property) =>
      property.type === "Property" ? identifiersIn(property.value) : []
    );
  }
  return [];
};

export const noInlineSchemaCompileRule = defineRule({
  create(context) {
    const isStatic = (node: ESTree.Node) =>
      identifiersIn(node).every((identifier) => {
        const variable = variableNamed(
          context.sourceCode.getScope(identifier),
          context.sourceCode.getText(identifier)
        );
        return (
          variable === null ||
          variable.scope.type === "module" ||
          variable.scope.type === "global"
        );
      });
    const schemaNames = new Set<string>();
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== "CallExpression" ||
          callee.callee.type !== "MemberExpression" ||
          callee.callee.object.type !== "Identifier" ||
          !schemaNames.has(callee.callee.object.name) ||
          !compiler.test(memberName(callee.callee, raw) ?? "") ||
          !insideFunction(node) ||
          callee.arguments.some((argument) => !isStatic(argument))
        ) {
          return;
        }
        context.report({ messageId: "inline", node: callee });
      },
      ImportDeclaration(node) {
        for (const name of namespaceNames(node, schemaModules, "Schema")) {
          schemaNames.add(name);
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow compiling a static Schema decoder or encoder inside a function on every call.",
    },
    messages: {
      inline:
        "This builds a Schema decoder on every call. Hoist it to a module constant, for example `const decodeTarget = Schema.decodeUnknownEffect(Target)`.",
    },
    type: "suggestion",
  },
});
