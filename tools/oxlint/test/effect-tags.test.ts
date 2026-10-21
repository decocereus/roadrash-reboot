import { noManualTagComparisonRule } from "../rushline/rules/no-manual-tag-comparison.ts";
import { noManualTaggedConstructionRule } from "../rushline/rules/no-manual-tagged-construction.ts";
import { runRule } from "./cases.ts";

runRule("rushline/no-manual-tag-comparison", noManualTagComparisonRule, {
  invalid: [
    {
      code: "if (reply._tag === 'failed') stop();",
      errors: [{ messageId: "manualComparison" }],
    },
    {
      code: "const done = 'done' !== step['_tag'];",
      errors: [{ messageId: "manualComparison" }],
    },
    {
      code: "const missing = decoded._tag === 'None';",
      errors: [{ messageId: "manualComparison" }],
    },
    {
      code: "switch (reply._tag) { default: break; }",
      errors: [{ messageId: "manualSwitch" }],
    },
  ],
  valid: [
    "Match.value(reply).pipe(Match.tag('failed', stop), Match.orElse(go));",
    "if (reply.kind === 'failed') stop();",
    "const missing = Option.isNone(decoded);",
    "Effect.catch(program, (error) => error._tag === 'Timeout' ? retry : done);",
  ],
});

runRule(
  "rushline/no-manual-tagged-construction",
  noManualTaggedConstructionRule,
  {
    invalid: [
      {
        code: "const reply = { _tag: 'failed', message };",
        errors: [{ messageId: "manualConstruction" }],
      },
      {
        code: "const reply = { '_tag': 'done' };",
        errors: [{ messageId: "manualConstruction" }],
      },
    ],
    valid: [
      "const reply = Reply.failed({ message });",
      "Match.when({ _tag: 'failed' }, stop);",
      "const reply = { _tag: tag };",
      "const reply = { _tag: 1 };",
    ],
  }
);
