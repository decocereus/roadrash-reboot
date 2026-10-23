import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class VerificationError extends TaggedErrorClass<VerificationError>()(
  "VerificationError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
    operation: Schema.String,
    run: Schema.optionalKey(Schema.String),
  }
) {}
