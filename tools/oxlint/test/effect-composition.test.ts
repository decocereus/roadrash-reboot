import { noFloatingEffectRule } from "../rushline/rules/no-floating-effect.ts";
import { preferEffectFnRule } from "../rushline/rules/prefer-effect-fn.ts";
import { runRule } from "./cases.ts";

const floating = [{ messageId: "floating" }];
const named = [{ messageId: "named" }];
const prelude = "import * as Effect from 'effect/Effect';";

runRule("rushline/no-floating-effect", noFloatingEffectRule, {
  invalid: [
    {
      code: `${prelude} Effect.log('dropped');`,
      errors: floating,
    },
    {
      code: "import * as Fx from 'effect/Effect'; const f = () => { Fx.logInfo('a').pipe(Fx.asVoid); };",
      errors: floating,
    },
    {
      code: "import { Effect } from 'effect'; export const run = Effect.gen(function* () { Effect.log('x'); });",
      errors: floating,
    },
  ],
  valid: [
    `${prelude} export const run = Effect.gen(function* () { yield* Effect.log('x'); });`,
    `${prelude} const f = () => Effect.log('x');`,
    `${prelude} export const run = Effect.log('x');`,
    "const Effect = { log() {} }; Effect.log('x');",
    "import * as Layer from 'effect/Layer'; Layer.empty.pipe();",
  ],
});

runRule("rushline/prefer-effect-fn", preferEffectFnRule, {
  invalid: [
    {
      code: `${prelude} export const load = (id) => Effect.gen(function* () { return id; });`,
      errors: named,
    },
    {
      code: `${prelude} export const service = Store.of({ load: (id) => Effect.gen(function* () { return id; }) });`,
      errors: named,
    },
    {
      code: "import { Effect } from 'effect'; export const load = () => Effect.gen(function* () {});",
      errors: named,
    },
  ],
  valid: [
    `${prelude} export const load = Effect.fn("Store.load")(function* (id) { return id; });`,
    `${prelude} const load = (id) => Effect.gen(function* () { return id; });`,
    `${prelude} export const service = Store.of({ load });`,
    `${prelude} export const load = (id) => Effect.succeed(id);`,
    "const Effect = { gen() {} }; export const load = () => Effect.gen();",
  ],
});
