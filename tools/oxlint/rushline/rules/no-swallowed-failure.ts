import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { effectModules, namespaceNames } from "../effect-names.ts";
import { memberName } from "../property-name.ts";

const swallowing = new Set(["ignore", "ignoreLogged", "orDie"]);

export const noSwallowedFailureRule = defineRule({
  create(context) {
    const effectNames = new Set<string>();
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    return {
      ImportDeclaration(node) {
        for (const name of namespaceNames(node, effectModules, "Effect")) {
          effectNames.add(name);
        }
      },
      MemberExpression(node) {
        if (
          node.object.type !== "Identifier" ||
          !effectNames.has(node.object.name)
        ) {
          return;
        }
        const name = memberName(node, raw);
        if (name !== null && swallowing.has(name)) {
          context.report({ data: { name }, messageId: "swallowed", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow Effect.orDie, Effect.ignore and Effect.ignoreLogged, which hide a failure.",
    },
    messages: {
      swallowed:
        "`Effect.{{name}}` hides a failure. Propagate the typed error, turn a known failure into an outcome with `catchTag`, or record a failed cleanup as an outcome.",
    },
    type: "problem",
  },
});
