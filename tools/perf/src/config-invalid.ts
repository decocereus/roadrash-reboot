import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class ConfigInvalid extends TaggedErrorClass<ConfigInvalid>()(
  "ConfigInvalid",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}
