import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class MeasurementFailed extends TaggedErrorClass<MeasurementFailed>()(
  "MeasurementFailed",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    lane: Schema.Literals(["node", "build"]),
    message: Schema.String,
  }
) {}
