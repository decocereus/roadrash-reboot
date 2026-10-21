import { noChainedTypeAssertionsRule } from "../anti-slop/rules/no-chained-type-assertions.ts";
import { requireSafetyCommentForTypeAssertionRule } from "../anti-slop/rules/require-safety-comment-for-type-assertion.ts";
import { runRule } from "./cases.ts";

runRule("anti-slop/no-chained-type-assertions", noChainedTypeAssertionsRule, {
  invalid: [
    {
      code: "const a = value as unknown as User;",
      errors: [{ messageId: "chained" }],
    },
    {
      code: "const a = ((value as unknown)) as User;",
      errors: [{ messageId: "chained" }],
    },
    {
      code: "const a = <User>(<unknown>value);",
      errors: [{ messageId: "chained" }],
    },
  ],
  valid: [
    "const a = value as User;",
    "const a = ['x'] as const;",
    "const a = (['x'] as const) as const;",
  ],
});

runRule(
  "anti-slop/require-safety-comment-for-type-assertion",
  requireSafetyCommentForTypeAssertionRule,
  {
    invalid: [
      {
        code: "const a = value as User;",
        errors: [{ messageId: "missingSafetyComment" }],
      },
      {
        code: "// SAFETY: checked above\nconst a = 1;\nconst b = value as User;",
        errors: [{ messageId: "missingSafetyComment" }],
      },
      {
        code: "// safety: lower case does not count\nconst a = value as User;",
        errors: [{ messageId: "missingSafetyComment" }],
      },
    ],
    valid: [
      "const a = ['x'] as const;",
      "// SAFETY: the schema decoded this value\nconst a = value as User;",
      "function f() {\n  // SAFETY: tagged by the caller\n  return value as User;\n}",
      "const a = run(/* SAFETY: narrowed by the guard */ value as User);",
    ],
  }
);
