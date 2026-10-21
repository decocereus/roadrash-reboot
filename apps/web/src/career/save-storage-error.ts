import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class SaveStorageFailed extends TaggedErrorClass<SaveStorageFailed>()(
  "SaveStorageFailed",
  {
    cause: Schema.Defect(),
    operation: Schema.Literals([
      "acquire",
      "read",
      "write",
      "backup",
      "remove",
    ]),
  }
) {}
