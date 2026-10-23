import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class ModelDecodeFailed extends TaggedErrorClass<ModelDecodeFailed>()(
  "ModelDecodeFailed",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    url: Schema.String,
  }
) {}
