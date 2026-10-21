import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class TelemetryStoreError extends TaggedErrorClass<TelemetryStoreError>()(
  "TelemetryStoreError",
  {
    cause: Schema.Defect(),
    line: Schema.optionalKey(Schema.Number),
    operation: Schema.Literals(["read", "decode", "mkdir", "append"]),
    path: Schema.String,
  }
) {}
