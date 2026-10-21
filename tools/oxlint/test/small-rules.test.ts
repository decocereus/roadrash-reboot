import { noConditionalEmptyObjectSpreadRule } from "../anti-slop/rules/no-conditional-empty-object-spread.ts";
import { noRuntimeTypeofRule } from "../anti-slop/rules/no-runtime-typeof.ts";
import { noForbiddenTermInSymbolNamesRule } from "../anti-slop/rules/no-shape-in-symbol-names.ts";
import { runRule } from "./cases.ts";

runRule("anti-slop/no-runtime-typeof", noRuntimeTypeofRule, {
  invalid: [
    {
      code: "if (typeof value === 'string') run(value);",
      errors: [{ messageId: "runtimeTypeof" }],
    },
  ],
  valid: ["type Value = typeof value;", "const kind = value.kind;"],
});

runRule(
  "anti-slop/no-shape-in-symbol-names",
  noForbiddenTermInSymbolNamesRule,
  {
    invalid: [
      {
        code: "const userShape = 1;",
        errors: [
          { data: { name: "userShape" }, messageId: "forbiddenSymbolName" },
        ],
      },
      {
        code: "class A { #SHAPED = 1; }",
        errors: [
          { data: { name: "SHAPED" }, messageId: "forbiddenSymbolName" },
        ],
      },
      {
        code: "const node = <Shape />;",
        errors: [{ messageId: "forbiddenSymbolName" }],
        filename: "view.tsx",
      },
    ],
    valid: ["const user = 'shape';", "const contour = 1;"],
  }
);

runRule(
  "anti-slop/no-conditional-empty-object-spread",
  noConditionalEmptyObjectSpreadRule,
  {
    invalid: [
      {
        code: "const row = { ...(ok ? { a: 1 } : {}) };",
        errors: [{ messageId: "avoid" }],
      },
      {
        code: "const row = { ...(ok ? {} : { a: 1 }) };",
        errors: [{ messageId: "avoid" }],
      },
    ],
    valid: [
      "const row = { ...(ok ? { a: 1 } : { b: 2 }) };",
      "const list = [...(ok ? [1] : [])];",
      "const row = { ...base };",
    ],
  }
);
