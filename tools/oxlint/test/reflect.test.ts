import { noReflectApplyRule } from "../anti-slop/rules/no-reflect-apply.ts";
import { noReflectGetRule } from "../anti-slop/rules/no-reflect-get.ts";
import { runRule } from "./cases.ts";

runRule("anti-slop/no-reflect-get", noReflectGetRule, {
  invalid: [
    {
      code: "Reflect.get(value, 'name');",
      errors: [{ messageId: "reflectGet" }],
    },
    {
      code: "Reflect['get'](value, 'name');",
      errors: [{ messageId: "reflectGet" }],
    },
    {
      code: "globalThis.x = () => Reflect.get(a, b);",
      errors: [{ messageId: "reflectGet" }],
    },
  ],
  valid: [
    "value.name;",
    "Reflect.has(value, 'name');",
    "const Reflect = { get() {} }; Reflect.get(value, 'name');",
    "import { Reflect } from './mirror.ts'; Reflect.get(value, 'name');",
  ],
});

runRule("anti-slop/no-reflect-apply", noReflectApplyRule, {
  invalid: [
    {
      code: "Reflect.apply(fn, null, []);",
      errors: [{ messageId: "reflectApply" }],
    },
    {
      code: "Reflect['apply'](fn, null, []);",
      errors: [{ messageId: "reflectApply" }],
    },
  ],
  valid: [
    "fn();",
    "Reflect.get(a, b) && fn.apply(null, []);",
    "function run(Reflect) { return Reflect.apply(fn, null, []); }",
  ],
});
