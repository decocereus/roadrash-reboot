import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class BrowserError extends TaggedErrorClass<BrowserError>()(
  "BrowserError",
  {
    browser: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(Schema.Defect()),
    message: Schema.String,
    operation: Schema.String,
    port: Schema.optionalKey(Schema.Number),
  }
) {}
