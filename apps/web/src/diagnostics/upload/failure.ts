import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class UploadFailure extends TaggedErrorClass<UploadFailure>()(
  "UploadFailure",
  {
    cause: Schema.Defect(),
    reason: Schema.String,
  }
) {}
