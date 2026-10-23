import { requireSuppressionReasonRule } from "../rushline/rules/require-suppression-reason.ts";
import { runRule } from "./cases.ts";

runRule("rushline/require-suppression-reason", requireSuppressionReasonRule, {
  invalid: [
    {
      code: "// oxlint-disable-next-line no-console\nconsole.log(1);",
      errors: [{ messageId: "lintReason" }],
    },
    {
      code: "/* eslint-disable */\nconst a = 1;",
      errors: [{ messageId: "lintReason" }],
    },
    {
      code: "const a = 1; // oxlint-disable-line no-magic-numbers --",
      errors: [{ messageId: "lintReason" }],
    },
    {
      code: "// @ts-ignore\nconst a: string = 1;",
      errors: [{ messageId: "bannedTypeDirective" }],
    },
    {
      code: "// @ts-nocheck\nconst a = 1;",
      errors: [{ messageId: "bannedTypeDirective" }],
    },
    {
      code: "// @ts-expect-error\nconst a: string = 1;",
      errors: [{ messageId: "expectErrorReason" }],
    },
    {
      code: "// @ts-expect-error --\nconst a: string = 1;",
      errors: [{ messageId: "expectErrorReason" }],
    },
  ],
  valid: [
    "// oxlint-disable-next-line no-console -- the CLI prints its result\nconsole.log(1);",
    "/* oxlint-disable max-classes-per-file -- one module exports three runtime classes */",
    "// @ts-expect-error -- the fixture is deliberately the wrong type\nconst a: string = 1;",
    "// oxlint-enable no-console",
    "// the word oxlint-disable inside prose is not a directive",
  ],
});
