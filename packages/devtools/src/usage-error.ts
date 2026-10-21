import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class UsageError extends TaggedErrorClass<UsageError>()("UsageError", {
  message: Schema.String,
}) {}
