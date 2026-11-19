import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class AuditionFailed extends TaggedErrorClass<AuditionFailed>()(
  "AuditionFailed",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}
