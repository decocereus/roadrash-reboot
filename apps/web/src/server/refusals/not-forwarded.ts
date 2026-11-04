import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class NotForwarded extends TaggedErrorClass<NotForwarded>()(
  "NotForwarded",
  { cause: Schema.Defect() }
) {}
