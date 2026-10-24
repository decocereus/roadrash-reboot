import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class RulesDecodeFailed extends TaggedErrorClass<RulesDecodeFailed>()(
  "RulesDecodeFailed",
  { cause: Schema.Defect(), message: Schema.String }
) {}
