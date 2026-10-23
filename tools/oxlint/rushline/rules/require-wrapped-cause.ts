import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import { effectModules, namespaceNames } from "../effect-names.ts";
import { memberName } from "../property-name.ts";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

const tryCalls = new Set(["try", "tryPromise"]);
const logTaps = new Set(["tapCause", "tapError", "tapErrorCause"]);

const asFunction = (node: ESTree.Node | undefined): FunctionNode | null =>
  node !== undefined &&
  (node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression")
    ? node
    : null;

const keepsError = (context: Context, handler: FunctionNode) => {
  const [first] = handler.params;
  if (first === undefined || first.type !== "Identifier") {
    return false;
  }
  const variable = context.sourceCode
    .getDeclaredVariables(handler)
    .find((candidate) => candidate.name === first.name);
  return (
    variable !== undefined &&
    variable.references.some(
      (reference) =>
        reference.identifier.parent.type !== "UnaryExpression" ||
        reference.identifier.parent.operator !== "void"
    )
  );
};

export const requireWrappedCauseRule = defineRule({
  create(context) {
    const effectNames = new Set<string>();
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);

    const effectMember = (node: ESTree.Node): string | null => {
      if (
        node.type !== "MemberExpression" ||
        node.object.type !== "Identifier" ||
        !effectNames.has(node.object.name)
      ) {
        return null;
      }
      return memberName(node, raw);
    };

    const loggedBefore = (call: ESTree.CallExpression) => {
      const { parent } = call;
      if (parent.type !== "CallExpression") {
        return false;
      }
      const index = parent.arguments.indexOf(call);
      const previous = index > 0 ? parent.arguments[index - 1] : undefined;
      if (
        previous?.type !== "CallExpression" ||
        !logTaps.has(effectMember(previous.callee) ?? "")
      ) {
        return false;
      }
      const tap = asFunction(previous.arguments[0]);
      return tap === null || keepsError(context, tap);
    };

    const check = (
      handler: FunctionNode | null,
      call: ESTree.CallExpression
    ) => {
      if (
        handler !== null &&
        !keepsError(context, handler) &&
        !loggedBefore(call)
      ) {
        context.report({ messageId: "dropped", node: handler });
      }
    };

    return {
      CallExpression(node) {
        const name = effectMember(node.callee);
        if (name === "mapError") {
          check(asFunction(node.arguments.at(-1)), node);
        }
        const [options] = node.arguments;
        if (
          name !== null &&
          tryCalls.has(name) &&
          options?.type === "ObjectExpression"
        ) {
          for (const property of options.properties) {
            if (
              property.type === "Property" &&
              property.key.type === "Identifier" &&
              property.key.name === "catch"
            ) {
              check(asFunction(property.value), node);
            }
          }
        }
      },
      ImportDeclaration(node) {
        for (const name of namespaceNames(node, effectModules, "Effect")) {
          effectNames.add(name);
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Require error-mapping handlers to keep the original failure as `cause`.",
    },
    messages: {
      dropped:
        "This handler drops the original failure. Pass it as `cause`, or log it with `Effect.tapError` right before mapping it.",
    },
    type: "problem",
  },
});
