import * as Schema from "effect/Schema";

const SeatPlanSchema = Schema.Struct({
  full: Schema.Boolean,
  opener: Schema.Boolean,
  roomId: Schema.String,
});

const ClientPlanSchema = Schema.Struct({
  endAt: Schema.Number,
  inputEvery: Schema.Number,
  mostSent: Schema.Number,
  seats: Schema.Array(SeatPlanSchema),
  startAt: Schema.Number,
  url: Schema.String,
});

export type ClientPlan = typeof ClientPlanSchema.Type;
export type SeatPlan = typeof SeatPlanSchema.Type;

const FullSeatResultSchema = Schema.Struct({
  desyncs: Schema.Number,
  digestMatched: Schema.Boolean,
  hashesCompared: Schema.Number,
  refusedPredictions: Schema.Number,
  resimulatedTicks: Schema.Number,
  rollbacks: Schema.Number,
  rttMs: Schema.Number,
  ticks: Schema.Number,
});

const ClientResultSchema = Schema.Struct({
  capped: Schema.Boolean,
  full: Schema.Array(FullSeatResultSchema),
  gaps: Schema.Array(Schema.Tuple([Schema.Number, Schema.Number])),
  heard: Schema.Number,
  loopMaxMs: Schema.Number,
  loopP99Ms: Schema.Number,
  lost: Schema.Number,
  refused: Schema.Number,
  sent: Schema.Number,
  worstRttMs: Schema.Number,
});

export type ClientResult = typeof ClientResultSchema.Type;

const ClientPlanJson = Schema.fromJsonString(ClientPlanSchema);
const ClientResultJson = Schema.fromJsonString(ClientResultSchema);

export const decodeClientPlan = Schema.decodeUnknownEffect(ClientPlanJson);
export const encodeClientPlan = Schema.encodeSync(ClientPlanJson);
export const decodeClientResult = Schema.decodeUnknownEffect(ClientResultJson);
export const encodeClientResult = Schema.encodeSync(ClientResultJson);
