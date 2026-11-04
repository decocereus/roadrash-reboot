import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class BenchBusy extends TaggedErrorClass<BenchBusy>()("BenchBusy", {
  message: Schema.String,
}) {}
