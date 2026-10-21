import { noCommentsRule } from "../rushline/rules/no-comments.ts";
import { safetyVerifiedByRule } from "../rushline/rules/safety-verified-by.ts";
import { runRule } from "./cases.ts";

const realTest = "have tests for every rule they register";

runRule("rushline/no-comments", noCommentsRule, {
  invalid: [
    {
      code: "// explain the next line\nconst a = 1;",
      errors: [{ messageId: "comment" }],
    },
    {
      code: "const a = 1; // trailing note",
      errors: [{ messageId: "comment" }],
    },
    {
      code: "/** The speed in metres per second. */\nexport const speed = 1;",
      errors: [{ messageId: "comment" }],
    },
    {
      code: "/* block */ const a = 1;",
      errors: [{ messageId: "comment" }],
    },
    {
      code: "// TODO: later\nconst a = 1;",
      errors: [{ messageId: "comment" }],
    },
    {
      code: "// oxlint-disable-next-line no-console -- the CLI prints\n// and prose after it\nconsole.log(1);",
      errors: [{ messageId: "comment" }],
    },
    {
      code: "// @ts-ignore\nconst a: string = 1;",
      errors: [{ messageId: "comment" }],
    },
    {
      code: "const node = <div>{/* note */}</div>;",
      errors: [{ messageId: "comment" }],
      filename: "view.tsx",
    },
    {
      code: "// note\nexport const a = 1;",
      errors: [{ messageId: "comment" }],
      filename: "script.mjs",
    },
    {
      code: "// SAFETY: one\n// Verified by: x\n\n// separate prose\nconst a = value as User;",
      errors: [{ messageId: "comment" }],
    },
  ],
  valid: [
    "// oxlint-disable-next-line no-console -- the CLI prints its result\nconsole.log(1);",
    "/* oxlint-disable max-classes-per-file -- one module, three classes */",
    "// eslint-disable-next-line no-console -- the CLI prints\nconsole.log(1);",
    "// oxlint-enable no-console",
    "// @ts-expect-error -- the fixture is deliberately the wrong type\nconst a: string = 1;",
    "// SAFETY: the guard above narrowed it\n// and nothing writes it after.\n// Verified by: x\nconst a = value as User;",
    "/* SAFETY: narrowed by the guard */ run(value as User);",
    '/// <reference types="vite/client" />',
    "const m = await import(/* @vite-ignore */ url);",
    "const a = /*#__PURE__*/ make();",
    "const b = /* @__PURE__ */ make();",
    "const url = 'http://example.com'; const re = /\\/\\/ not a comment/u;",
    "const text = `/* not a comment */`;",
    { code: "#!/usr/bin/env node\nconst a = 1;", filename: "script.mjs" },
  ],
});

runRule("rushline/safety-verified-by", safetyVerifiedByRule, {
  invalid: [
    {
      code: "// SAFETY: narrowed by the guard above\nconst a = value as User;",
      errors: [{ messageId: "missing" }],
    },
    {
      code: "/* SAFETY: narrowed by the guard */ run(value as User);",
      errors: [{ messageId: "missing" }],
    },
    {
      code: "// SAFETY: narrowed above\n// Verified by: a test nobody wrote\nconst a = value as User;",
      errors: [
        { data: { title: "a test nobody wrote" }, messageId: "unknownTest" },
      ],
    },
    {
      code: `// SAFETY: narrowed above\n\n// Verified by: ${realTest}\nconst a = value as User;`,
      errors: [{ messageId: "missing" }],
    },
  ],
  valid: [
    `// SAFETY: narrowed by the guard above\n// Verified by: ${realTest}\nconst a = value as User;`,
    `/*\n * SAFETY: narrowed by the guard above.\n * Verified by: ${realTest}\n */\nconst a = value as User;`,
    "const a = 1;",
  ],
});
