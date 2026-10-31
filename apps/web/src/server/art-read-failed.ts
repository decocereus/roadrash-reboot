import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class ArtReadFailed extends TaggedErrorClass<ArtReadFailed>()(
  "ArtReadFailed",
  {
    cause: Schema.Defect(),
    key: Schema.String,
  }
) {}
