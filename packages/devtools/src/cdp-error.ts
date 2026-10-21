import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class CdpError extends TaggedErrorClass<CdpError>()("CdpError", {
  cause: Schema.optionalKey(Schema.Defect()),
  message: Schema.String,
  method: Schema.optionalKey(Schema.String),
  operation: Schema.String,
  requestId: Schema.optionalKey(Schema.Number),
}) {}
