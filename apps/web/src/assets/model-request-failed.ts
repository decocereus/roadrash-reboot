import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class ModelRequestFailed extends TaggedErrorClass<ModelRequestFailed>()(
  "ModelRequestFailed",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    url: Schema.String,
  }
) {}
