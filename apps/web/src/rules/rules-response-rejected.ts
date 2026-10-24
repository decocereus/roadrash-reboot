import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class RulesResponseRejected extends TaggedErrorClass<RulesResponseRejected>()(
  "RulesResponseRejected",
  { message: Schema.String, status: Schema.Number }
) {}
