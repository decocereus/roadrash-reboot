import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class FontReadinessFailed extends TaggedErrorClass<FontReadinessFailed>()(
  "FontReadinessFailed",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}
