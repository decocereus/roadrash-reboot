import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class RulesRequestFailed extends TaggedErrorClass<RulesRequestFailed>()(
  "RulesRequestFailed",
  { cause: Schema.Defect(), message: Schema.String }
) {}
