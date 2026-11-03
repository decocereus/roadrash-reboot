import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class DesktopError extends TaggedErrorClass<DesktopError>()(
  "DesktopError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
    operation: Schema.String,
  }
) {}
