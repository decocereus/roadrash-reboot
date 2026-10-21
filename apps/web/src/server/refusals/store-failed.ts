import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class StoreFailed extends TaggedErrorClass<StoreFailed>()(
  "StoreFailed",
  { cause: Schema.Defect() }
) {}
