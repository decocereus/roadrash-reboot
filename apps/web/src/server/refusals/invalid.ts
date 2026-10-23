import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class Invalid extends TaggedErrorClass<Invalid>()("Invalid", {
  cause: Schema.Defect(),
}) {}
