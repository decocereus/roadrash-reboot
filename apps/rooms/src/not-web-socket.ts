import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class NotWebSocket extends TaggedErrorClass<NotWebSocket>()(
  "NotWebSocket",
  { message: Schema.String }
) {}
