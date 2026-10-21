import * as Schema from "effect/Schema";

const envelope = Schema.Struct({
  error: Schema.optionalKey(Schema.Struct({ message: Schema.String })),
  id: Schema.optionalKey(Schema.Number),
  method: Schema.optionalKey(Schema.String),
  params: Schema.optionalKey(Schema.Unknown),
  result: Schema.optionalKey(Schema.Unknown),
});

export const decodeEnvelope = Schema.decodeUnknownSync(envelope);

export type Envelope = typeof envelope.Type;

type ParamValue =
  | string
  | number
  | boolean
  | readonly ParamValue[]
  | CommandParams;

export interface CommandParams {
  readonly [name: string]: ParamValue;
}

export const evaluated = Schema.Struct({
  exceptionDetails: Schema.optionalKey(
    Schema.Struct({
      exception: Schema.optionalKey(
        Schema.Struct({ description: Schema.optionalKey(Schema.String) })
      ),
      text: Schema.String,
    })
  ),
  result: Schema.Struct({ value: Schema.optionalKey(Schema.Unknown) }),
});
