import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class NotJson extends TaggedErrorClass<NotJson>()("NotJson", {
  cause: Schema.Defect(),
}) {}
