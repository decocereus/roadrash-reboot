import { requireWrappedCauseRule } from "../rushline/rules/require-wrapped-cause.ts";
import { runRule } from "./cases.ts";

const dropped = [{ messageId: "dropped" }];
const prelude = "import * as Effect from 'effect/Effect';";

runRule("rushline/require-wrapped-cause", requireWrappedCauseRule, {
  invalid: [
    {
      code: `${prelude} export const run = read.pipe(Effect.mapError(() => new Failed({ message: "x" })));`,
      errors: dropped,
    },
    {
      code: `${prelude} export const run = read.pipe(Effect.mapError((error) => { void error; return new Failed({}); }));`,
      errors: dropped,
    },
    {
      code: `${prelude} export const run = Effect.tryPromise({ catch: () => new Failed({}), try: () => fetch("x") });`,
      errors: dropped,
    },
    {
      code: `${prelude} export const run = Effect.mapError(read, function () { return new Failed({}); });`,
      errors: dropped,
    },
    {
      code: `${prelude} export const run = read.pipe(Effect.mapError(({ message }) => new Failed({ message })));`,
      errors: dropped,
    },
    {
      code: `${prelude} export const run = read.pipe(Effect.tapError(() => Effect.log("x")), Effect.mapError(() => unavailable));`,
      errors: dropped,
    },
    {
      code: "import { Effect } from 'effect'; export const run = read.pipe(Effect.mapError(() => unavailable));",
      errors: dropped,
    },
  ],
  valid: [
    `${prelude} export const run = read.pipe(Effect.mapError((cause) => new Failed({ cause })));`,
    `${prelude} import * as Option from 'effect/Option'; export const run = read.pipe(Effect.mapError((cause) => new Failed({ cause: Option.some(cause) })));`,
    `${prelude} export const run = Effect.tryPromise({ catch: (cause) => new Failed({ cause }), try: () => fetch("x") });`,
    `${prelude} export const run = read.pipe(Effect.mapError(toFailure));`,
    `${prelude} export const run = read.pipe(Effect.tapError((cause) => Effect.logError("read", cause)), Effect.mapError(() => unavailable));`,
    `${prelude} export const run = read.pipe(Effect.tapCause(Effect.logError), Effect.mapError(() => unavailable));`,
    "const Effect = { mapError() {} }; Effect.mapError(() => 1);",
    `${prelude} export const run = read.pipe(Effect.catch(() => Effect.succeed(null)));`,
  ],
});
