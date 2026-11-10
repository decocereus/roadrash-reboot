import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class StorageFailed extends TaggedErrorClass<StorageFailed>()(
  "StorageFailed",
  { cause: Schema.Defect(), message: Schema.String }
) {}
