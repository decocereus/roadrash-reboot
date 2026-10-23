import { defineRule } from "@oxlint/plugins";

import {
  isInsideBroadEffectHandler,
  isTagMember,
  tagMemberFromComparison,
} from "../tagged-values.ts";

export const noManualTagComparisonRule = defineRule({
  createOnce(context) {
    return {
      BinaryExpression(node) {
        if (
          tagMemberFromComparison(node) === undefined ||
          isInsideBroadEffectHandler(node)
        ) {
          return;
        }
        context.report({ messageId: "manualComparison", node });
      },
      SwitchStatement(node) {
        if (
          !isTagMember(node.discriminant) ||
          isInsideBroadEffectHandler(node)
        ) {
          return;
        }
        context.report({ messageId: "manualSwitch", node });
      },
    };
  },
  meta: {
    docs: {
      description:
        "Use Effect Option, Match or Predicate helpers instead of manually branching on `_tag`.",
    },
    messages: {
      manualComparison:
        "Use Option or Match.tag/Match.tags for tagged-value branching, or Predicate.isTagged for a simple reusable predicate.",
      manualSwitch:
        "Use Match.value(value).pipe(Match.tag/Match.tags/Match.tagsExhaustive) or the tagged enum `$match` helper instead of switching on `_tag`.",
    },
    type: "problem",
  },
});
