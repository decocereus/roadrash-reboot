import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class ModelResponseRejected extends TaggedErrorClass<ModelResponseRejected>()(
  "ModelResponseRejected",
  {
    message: Schema.String,
    status: Schema.Number,
    url: Schema.String,
  }
) {}
