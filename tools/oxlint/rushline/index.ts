import { definePlugin } from "@oxlint/plugins";

import { noCommentsRule } from "./rules/no-comments.ts";
import { requireSuppressionReasonRule } from "./rules/require-suppression-reason.ts";
import { safetyVerifiedByRule } from "./rules/safety-verified-by.ts";

const rushlinePlugin = definePlugin({
  meta: { name: "rushline" },
  rules: {
    "no-comments": noCommentsRule,
    "require-suppression-reason": requireSuppressionReasonRule,
    "safety-verified-by": safetyVerifiedByRule,
  },
});

export default rushlinePlugin;
