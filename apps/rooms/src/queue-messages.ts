import * as Schema from "effect/Schema";

export const QUEUE_REFUSALS = ["build", "limited"] as const;

export type QueueRefusal = (typeof QUEUE_REFUSALS)[number];

const QueueMessageSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("waiting"), riders: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("placed"), roomId: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("refused"),
    reason: Schema.Literals(QUEUE_REFUSALS),
  }),
]);

export type QueueMessage = typeof QueueMessageSchema.Type;

const QueueMessageJson = Schema.fromJsonString(QueueMessageSchema);

export const encodeQueueMessage = Schema.encodeSync(QueueMessageJson);
export const decodeQueueMessage = Schema.decodeUnknownOption(QueueMessageJson);
