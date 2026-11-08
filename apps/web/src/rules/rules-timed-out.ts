import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class RulesTimedOut extends TaggedErrorClass<RulesTimedOut>()(
  "RulesTimedOut",
  { message: Schema.String }
) {}
