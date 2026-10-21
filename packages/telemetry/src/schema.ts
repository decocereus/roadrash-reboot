import * as Schema from "effect/Schema";

import {
  batchKinds,
  faultSources,
  frameRates,
  governReasons,
  HISTOGRAM_BUCKETS,
  MAX_EVENTS,
  MAX_FAULT_TEXT,
  MAX_PARTS,
  MAX_WORST_FRAMES,
  raceStages,
  resizeSources,
  TELEMETRY_VERSION,
  testDevices,
} from "./limits.ts";

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const FrameId = Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1));
const Milliseconds = Schema.Finite;
const text = (longest: number) =>
  Schema.String.check(Schema.isMaxLength(longest));
const listOf = <S extends Schema.Constraint>(item: S, longest: number) =>
  Schema.Array(item).check(Schema.isMaxLength(longest));

const testDeviceSchema = Schema.Literals(testDevices);

const sessionIdSchema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f][0-9a-f-]{7,63}$/u)
);

const buildSchema = Schema.Struct({
  dirty: Schema.Boolean,
  sha: text(64),
});

const sessionSchema = Schema.Struct({
  build: buildSchema,
  device: testDeviceSchema,
  pixelRatio: Schema.Finite,
  renderer: text(200),
  screenHeight: Count,
  screenWidth: Count,
  sessionId: sessionIdSchema,
  startedAt: text(40),
  userAgent: text(240),
});
export type Session = typeof sessionSchema.Type;

const qualitySchema = Schema.Struct({
  bloomScale: Schema.Finite,
  frameRate: Schema.optionalKey(Schema.Literals(frameRates)),
  pace: Count,
  pixelRatio: Schema.Finite,
  rung: Count,
  samples: Schema.optionalKey(Count),
  shadowMap: Count,
});
export type Quality = typeof qualitySchema.Type;

const worstFrameSchema = Schema.Struct({
  at: Milliseconds,
  calls: listOf(Count, MAX_PARTS),
  cpu: listOf(Schema.Finite, MAX_PARTS),
  discardedMs: Milliseconds,
  drawRung: Count,
  drawnEpoch: Count,
  frame: Count,
  intervalMs: Milliseconds,
  nextRung: Count,
  pixelRatio: Schema.Finite,
  race: Count,
  sizeEpoch: Count,
  tick: Count,
  ticks: Count,
});
export type WorstFrame = typeof worstFrameSchema.Type;

const stamp = {
  at: Milliseconds,
  frame: FrameId,
  race: Count,
  seq: Count,
};

const governorEventSchema = Schema.Struct({
  ...stamp,
  calmMs: Milliseconds,
  from: qualitySchema,
  kind: Schema.Literal("governor"),
  lateCredit: Schema.Finite,
  reason: Schema.Literals(governReasons),
  to: qualitySchema,
});

const canvasEventSchema = Schema.Struct({
  ...stamp,
  bufferHeight: Count,
  bufferWidth: Count,
  cssHeight: Schema.Finite,
  cssWidth: Schema.Finite,
  epoch: Count,
  kind: Schema.Literal("canvas"),
  source: Schema.Literals(resizeSources),
});

const invalidatedEventSchema = Schema.Struct({
  ...stamp,
  drawRung: Count,
  drawnEpoch: Count,
  kind: Schema.Literal("invalidated"),
  nextRung: Count,
  sizeEpoch: Count,
});

const incompletePassEventSchema = Schema.Struct({
  ...stamp,
  kind: Schema.Literal("incomplete-pass"),
});

const contextEventSchema = Schema.Struct({
  ...stamp,
  kind: Schema.Literal("context"),
  lost: Schema.Boolean,
});

const faultEventSchema = Schema.Struct({
  ...stamp,
  kind: Schema.Literal("fault"),
  message: text(MAX_FAULT_TEXT),
  source: Schema.Literals(faultSources),
  where: text(MAX_FAULT_TEXT),
});

const raceEventSchema = Schema.Struct({
  ...stamp,
  kind: Schema.Literal("race"),
  stage: Schema.Literals(raceStages),
  tick: Count,
});

const markerEventSchema = Schema.Struct({
  ...stamp,
  kind: Schema.Literal("marker"),
  tick: Count,
});

const visibilityEventSchema = Schema.Struct({
  ...stamp,
  hidden: Schema.Boolean,
  kind: Schema.Literal("visibility"),
});

const overlayEventSchema = Schema.Struct({
  ...stamp,
  kind: Schema.Literal("overlay"),
  on: Schema.Boolean,
});

const telemetryEventSchema = Schema.Union([
  governorEventSchema,
  canvasEventSchema,
  invalidatedEventSchema,
  incompletePassEventSchema,
  contextEventSchema,
  faultEventSchema,
  raceEventSchema,
  markerEventSchema,
  visibilityEventSchema,
  overlayEventSchema,
]);
export type TelemetryEvent = typeof telemetryEventSchema.Type;

const droppedSchema = Schema.Struct({
  batches: Count,
  events: Count,
  faults: Count,
});

export const batchSchema = Schema.Struct({
  at: Milliseconds,
  batchId: Count,
  discardedMs: Milliseconds,
  dropped: droppedSchema,
  events: listOf(telemetryEventSchema, MAX_EVENTS),
  frames: Count,
  fromFrame: Count,
  histogram: listOf(Count, HISTOGRAM_BUCKETS),
  kind: Schema.Literals(batchKinds),
  parts: listOf(text(16), MAX_PARTS),
  quality: Schema.NullOr(qualitySchema),
  reportId: Schema.NullOr(text(32)),
  sentAt: text(40),
  session: sessionSchema,
  toFrame: Count,
  totalMs: Milliseconds,
  version: Schema.Literal(TELEMETRY_VERSION),
  worst: listOf(worstFrameSchema, MAX_WORST_FRAMES),
});
export type Batch = typeof batchSchema.Type;

const ackSchema = Schema.Struct({
  batchId: Count,
  duplicate: Schema.Boolean,
  sessionId: sessionIdSchema,
});
export type Ack = typeof ackSchema.Type;

export const decodeBatchEffect = Schema.decodeUnknownEffect(batchSchema);

const storedLineSchema = Schema.Struct({
  batch: batchSchema,
  receivedAt: Schema.String,
});

export const decodeStoredLineEffect = Schema.decodeUnknownEffect(
  Schema.fromJsonString(storedLineSchema)
);
