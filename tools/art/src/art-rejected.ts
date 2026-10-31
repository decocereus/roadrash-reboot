import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class ArtRejected extends TaggedErrorClass<ArtRejected>()(
  "ArtRejected",
  {
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
  }
) {}
