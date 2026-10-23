import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class TooLarge extends TaggedErrorClass<TooLarge>()("TooLarge", {
  bytes: Schema.Number,
}) {}
