import { noManualEffectErrorTagRule } from "../rushline/rules/no-manual-effect-error-tag.ts";
import { noSwallowedFailureRule } from "../rushline/rules/no-swallowed-failure.ts";
import { preferCatchTagsRule } from "../rushline/rules/prefer-catch-tags.ts";
import { runRule } from "./cases.ts";

const prelude = "import * as Effect from 'effect/Effect';";

runRule("rushline/no-swallowed-failure", noSwallowedFailureRule, {
  invalid: [
    {
      code: `${prelude} export const run = save.pipe(Effect.orDie);`,
      errors: [{ data: { name: "orDie" }, messageId: "swallowed" }],
    },
    {
      code: `${prelude} export const run = Effect.ignore(save);`,
      errors: [{ data: { name: "ignore" }, messageId: "swallowed" }],
    },
    {
      code: "import { Effect as Fx } from 'effect'; export const run = save.pipe(Fx.ignoreLogged);",
      errors: [{ data: { name: "ignoreLogged" }, messageId: "swallowed" }],
    },
  ],
  valid: [
    `${prelude} export const run = save.pipe(Effect.catchTag("SlotTaken", () => Effect.succeed(null)));`,
    "const Effect = { orDie: 1 }; export const run = Effect.orDie;",
    `${prelude} export const run = save.pipe(Effect.asVoid);`,
  ],
});

runRule("rushline/prefer-catch-tags", preferCatchTagsRule, {
  invalid: [
    {
      code: `${prelude} export const run = work.pipe(Effect.catchTag("A", recover), Effect.catchTag("B", recover));`,
      errors: [{ messageId: "combine" }],
    },
  ],
  valid: [
    `${prelude} export const run = work.pipe(Effect.catchTags({ A: recover, B: recover }));`,
    `${prelude} export const run = work.pipe(Effect.catchTag("A", recover), Effect.asVoid, Effect.catchTag("B", recover));`,
    `${prelude} export const run = work.pipe(Effect.catchTag("A", recover));`,
    `${prelude} export const run = work.pipe(Effect.catchTag("A", first), Effect.catchTag("A", second));`,
  ],
});

runRule("rushline/no-manual-effect-error-tag", noManualEffectErrorTagRule, {
  invalid: [
    {
      code: "Effect.catch(program, (error) => error._tag === 'Timeout' ? retry : Effect.fail(error));",
      errors: [{ messageId: "tag" }],
    },
    {
      code: "Effect.catch(program, (error) => { switch (error.reason._tag) { default: return done; } });",
      errors: [{ messageId: "reason" }],
    },
  ],
  valid: [
    "Effect.catchTag(program, 'Timeout', () => retry);",
    "const known = row._tag === 'Done';",
  ],
});
