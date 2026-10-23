import { defineRule } from "@oxlint/plugins";
import type { ESTree, Variable } from "@oxlint/plugins";

import { variableNamed } from "../bindings.ts";
import { memberName } from "../property-name.ts";

const attributeClasses = new Set([
  "BufferAttribute",
  "Float16BufferAttribute",
  "Float32BufferAttribute",
  "InstancedBufferAttribute",
  "Int16BufferAttribute",
  "Int32BufferAttribute",
  "Int8BufferAttribute",
  "Uint16BufferAttribute",
  "Uint32BufferAttribute",
  "Uint8BufferAttribute",
  "Uint8ClampedBufferAttribute",
]);
const instanceAttributes = new Set(["instanceColor", "instanceMatrix"]);

const unwrapped = (node: ESTree.Node): ESTree.Node => {
  let current = node;
  while (
    current.type === "ChainExpression" ||
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    current = current.expression;
  }
  return current;
};

const className = (node: ESTree.Node): string | null => {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "TSQualifiedName") {
    return node.right.name;
  }
  if (node.type === "MemberExpression" && !node.computed) {
    return node.property.type === "Identifier" ? node.property.name : null;
  }
  return null;
};

const isAttributeType = (node: ESTree.TSType): boolean => {
  if (node.type === "TSUnionType") {
    return node.types.some(isAttributeType);
  }
  return (
    node.type === "TSTypeReference" &&
    attributeClasses.has(className(node.typeName) ?? "")
  );
};

const annotatedAsAttribute = (binding: ESTree.Node): boolean => {
  if (binding.type !== "Identifier" || !("typeAnnotation" in binding)) {
    return false;
  }
  const annotation = binding.typeAnnotation?.typeAnnotation;
  return annotation !== undefined && isAttributeType(annotation);
};

const statementsAround = (statement: ESTree.Node): readonly ESTree.Node[] => {
  const holder = statement.parent;
  if (holder === null) {
    return [];
  }
  if (
    holder.type === "BlockStatement" ||
    holder.type === "Program" ||
    holder.type === "StaticBlock"
  ) {
    return holder.body;
  }
  return holder.type === "SwitchCase" ? holder.consequent : [];
};

export const rangedBufferUploadRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);

    const sameReference = (left: ESTree.Node, right: ESTree.Node): boolean => {
      const a = unwrapped(left);
      const b = unwrapped(right);
      if (a.type === "MemberExpression" && b.type === "MemberExpression") {
        const name = memberName(a, raw);
        const sameKey =
          name === null
            ? a.computed && b.computed && raw(a.property) === raw(b.property)
            : name === memberName(b, raw);
        return sameKey && sameReference(a.object, b.object);
      }
      if (a.type === "CallExpression" && b.type === "CallExpression") {
        return (
          sameReference(a.callee, b.callee) &&
          a.arguments.length === b.arguments.length &&
          a.arguments.every((argument, index) => {
            const other = b.arguments[index];
            return other !== undefined && raw(argument) === raw(other);
          })
        );
      }
      return a.type === b.type && raw(a) === raw(b);
    };

    const isAttribute = (node: ESTree.Node, seen: Set<Variable>): boolean => {
      const target = unwrapped(node);
      if (target.type === "MemberExpression") {
        const holder = unwrapped(target.object);
        return (
          instanceAttributes.has(memberName(target, raw) ?? "") ||
          (holder.type === "MemberExpression" &&
            memberName(holder, raw) === "attributes")
        );
      }
      if (target.type === "CallExpression") {
        return (
          target.callee.type === "MemberExpression" &&
          memberName(target.callee, raw) === "getAttribute"
        );
      }
      if (target.type === "NewExpression") {
        return attributeClasses.has(className(target.callee) ?? "");
      }
      if (target.type !== "Identifier") {
        return false;
      }
      const variable = variableNamed(
        context.sourceCode.getScope(target),
        target.name
      );
      if (variable === null || seen.has(variable)) {
        return false;
      }
      seen.add(variable);
      return variable.defs.some((definition) => {
        if (definition.type === "Parameter") {
          return annotatedAsAttribute(definition.name);
        }
        const declarator = definition.node;
        return (
          definition.type === "Variable" &&
          declarator.type === "VariableDeclarator" &&
          declarator.id === definition.name &&
          (annotatedAsAttribute(declarator.id) ||
            (declarator.init !== null && isAttribute(declarator.init, seen)))
        );
      });
    };

    const rangedJustBefore = (
      assignment: ESTree.AssignmentExpression,
      receiver: ESTree.Node
    ): boolean => {
      const statement = assignment.parent;
      if (statement.type !== "ExpressionStatement") {
        return false;
      }
      const statements = statementsAround(statement);
      const previous = statements[statements.indexOf(statement) - 1];
      if (previous?.type !== "ExpressionStatement") {
        return false;
      }
      const call = unwrapped(previous.expression);
      return (
        call.type === "CallExpression" &&
        call.callee.type === "MemberExpression" &&
        memberName(call.callee, raw) === "addUpdateRange" &&
        sameReference(call.callee.object, receiver)
      );
    };

    return {
      AssignmentExpression(node) {
        const target = unwrapped(node.left);
        if (
          target.type !== "MemberExpression" ||
          memberName(target, raw) !== "needsUpdate" ||
          (node.operator === "=" &&
            node.right.type === "Literal" &&
            node.right.value === false) ||
          !isAttribute(target.object, new Set()) ||
          rangedJustBefore(node, target.object)
        ) {
          return;
        }
        context.report({ messageId: "unranged", node });
      },
    };
  },
  meta: {
    docs: {
      description:
        "Require an update range right before a buffer attribute is marked for upload.",
    },
    messages: {
      unranged:
        "This marks the whole buffer attribute for upload. Mark only the items that changed or are drawn with `uploadSpan` from apps/web/src/game/uploads.ts; `needsUpdate` on a buffer attribute must come right after an `addUpdateRange` call on the same attribute in the same block.",
    },
    type: "problem",
  },
});
