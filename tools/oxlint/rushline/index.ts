import { definePlugin } from "@oxlint/plugins";

import { deterministicCoreRule } from "./rules/deterministic-core.ts";
import { noCommentsRule } from "./rules/no-comments.ts";
import { noDiscardedExitRule } from "./rules/no-discarded-exit.ts";
import { noDistanceHideRule } from "./rules/no-distance-hide.ts";
import { noEffectRuntimeRule } from "./rules/no-effect-runtime.ts";
import { noEntriesLoopRule } from "./rules/no-entries-loop.ts";
import { noFloatingEffectRule } from "./rules/no-floating-effect.ts";
import { noHotAllocationRule } from "./rules/no-hot-allocation.ts";
import { noInlineSchemaCompileRule } from "./rules/no-inline-schema-compile.ts";
import { noManualEffectErrorTagRule } from "./rules/no-manual-effect-error-tag.ts";
import { noManualTagComparisonRule } from "./rules/no-manual-tag-comparison.ts";
import { noManualTaggedConstructionRule } from "./rules/no-manual-tagged-construction.ts";
import { noNodeIoRule } from "./rules/no-node-io.ts";
import { noPromiseRule } from "./rules/no-promise.ts";
import { noServiceConstructorImportsRule } from "./rules/no-service-constructor-imports.ts";
import { noSwallowedFailureRule } from "./rules/no-swallowed-failure.ts";
import { numericDrawSortRule } from "./rules/numeric-draw-sort.ts";
import { preferCatchTagsRule } from "./rules/prefer-catch-tags.ts";
import { preferEffectFnRule } from "./rules/prefer-effect-fn.ts";
import { preferEffectMatchRule } from "./rules/prefer-effect-match.ts";
import { rangedBufferUploadRule } from "./rules/ranged-buffer-upload.ts";
import { requireNulFileListRule } from "./rules/require-nul-file-list.ts";
import { requireSuppressionReasonRule } from "./rules/require-suppression-reason.ts";
import { requireWrappedCauseRule } from "./rules/require-wrapped-cause.ts";
import { riderByIdRule } from "./rules/rider-by-id.ts";
import { safetyVerifiedByRule } from "./rules/safety-verified-by.ts";
import { workspaceImportsRule } from "./rules/workspace-imports.ts";

const rushlinePlugin = definePlugin({
  meta: { name: "rushline" },
  rules: {
    "deterministic-core": deterministicCoreRule,
    "no-comments": noCommentsRule,
    "no-discarded-exit": noDiscardedExitRule,
    "no-distance-hide": noDistanceHideRule,
    "no-effect-runtime": noEffectRuntimeRule,
    "no-entries-loop": noEntriesLoopRule,
    "no-floating-effect": noFloatingEffectRule,
    "no-hot-allocation": noHotAllocationRule,
    "no-inline-schema-compile": noInlineSchemaCompileRule,
    "no-manual-effect-error-tag": noManualEffectErrorTagRule,
    "no-manual-tag-comparison": noManualTagComparisonRule,
    "no-manual-tagged-construction": noManualTaggedConstructionRule,
    "no-node-io": noNodeIoRule,
    "no-promise": noPromiseRule,
    "no-service-constructor-imports": noServiceConstructorImportsRule,
    "no-swallowed-failure": noSwallowedFailureRule,
    "numeric-draw-sort": numericDrawSortRule,
    "prefer-catch-tags": preferCatchTagsRule,
    "prefer-effect-fn": preferEffectFnRule,
    "prefer-effect-match": preferEffectMatchRule,
    "ranged-buffer-upload": rangedBufferUploadRule,
    "require-nul-file-list": requireNulFileListRule,
    "require-suppression-reason": requireSuppressionReasonRule,
    "require-wrapped-cause": requireWrappedCauseRule,
    "rider-by-id": riderByIdRule,
    "safety-verified-by": safetyVerifiedByRule,
    "workspace-imports": workspaceImportsRule,
  },
});

export default rushlinePlugin;
