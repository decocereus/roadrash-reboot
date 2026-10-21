import { defineRule } from "@oxlint/plugins";

import {
  isMatchPatternObject,
  isStringLiteral,
  propertyName,
} from "../tagged-values.ts";

export const noManualTaggedConstructionRule = defineRule({
  createOnce(context) {
    return {
      ObjectExpression(node) {
        if (isMatchPatternObject(node)) {
          return;
        }
        const tag = node.properties.find(
          (property) =>
            property.type === "Property" &&
            propertyName(property) === "_tag" &&
            isStringLiteral(property.value)
        );
        if (tag !== undefined) {
          context.report({ messageId: "manualConstruction", node: tag });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Construct tagged values with their existing Effect constructor instead of writing `_tag` manually.",
    },
    messages: {
      manualConstruction:
        "Use the existing Schema tagged `.make`, tagged class/error constructor, or Data.taggedEnum variant constructor instead of writing a literal `_tag` object.",
    },
    type: "problem",
  },
});
