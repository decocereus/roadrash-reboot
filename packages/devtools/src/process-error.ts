import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class ProcessError extends TaggedErrorClass<ProcessError>()(
  "ProcessError",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    executable: Schema.optionalKey(Schema.String),
    message: Schema.String,
    operation: Schema.String,
    pid: Schema.optionalKey(Schema.Number),
  }
) {}
