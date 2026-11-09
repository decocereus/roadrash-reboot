import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { REFUSALS } from "./messages.ts";

export const WAKE_GAP_CEILINGS_MS = [20, 34, 50, 100] as const;

export const noteGap = (gaps: Uint32Array, gapMs: number): void => {
  let bucket = 0;
  while (
    bucket < WAKE_GAP_CEILINGS_MS.length &&
    gapMs > (WAKE_GAP_CEILINGS_MS[bucket] ?? gapMs)
  ) {
    bucket += 1;
  }
  gaps[bucket] = (gaps[bucket] ?? 0) + 1;
};

const orMissing = <S extends Schema.Top>(schema: S) =>
  Schema.NullOr(schema).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(null))
  );

export const SeatTallySchema = Schema.Struct({
  accepted: Schema.Number,
  ahead: Schema.Number,
  late: Schema.Number,
  missed: Schema.Number,
  rider: Schema.Number,
});

export type SeatTally = typeof SeatTallySchema.Type;

const RaceSeatSchema = Schema.Struct({
  ...SeatTallySchema.fields,
  asn: orMissing(Schema.Number),
  colo: orMissing(Schema.String),
  crashes: Schema.Number,
  finishTick: Schema.Number,
  leftAtTick: orMissing(Schema.Number),
  mode: Schema.String,
  network: orMissing(Schema.String),
  readyMs: orMissing(Schema.Number),
  reported: Schema.Boolean,
  roadMetres: Schema.Number,
  tcpRttMs: orMissing(Schema.Number),
});

export type RaceSeat = typeof RaceSeatSchema.Type;

const Refused = Schema.Struct({
  kind: Schema.Literal("refused"),
  reason: Schema.Literals(REFUSALS),
});

const Started = Schema.Struct({
  at: Schema.Number,
  build: Schema.String,
  digest: Schema.String,
  kind: Schema.Literal("started"),
  lobbyMs: Schema.Number,
  police: orMissing(Schema.String),
  protocol: orMissing(Schema.Number),
  raceId: Schema.String,
  road: Schema.String,
  roomColo: orMissing(Schema.String),
  seats: Schema.Number,
  seed: Schema.Number,
  tier: orMissing(Schema.Number),
  trackHash: orMissing(Schema.String),
  traffic: orMissing(Schema.String),
});

const Countdown = Schema.Struct({
  kind: Schema.Literal("countdown"),
  raceId: Schema.String,
  stillLoading: Schema.Array(Schema.Number).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed<readonly number[]>([]))
  ),
  waitedMs: Schema.Number,
});

const Left = Schema.Struct({
  closeCode: orMissing(Schema.Number),
  kind: Schema.Literal("left"),
  raceId: Schema.String,
  seatsLeft: Schema.Number,
  tally: SeatTallySchema,
  tick: Schema.Number,
});

const Held = Schema.Struct({
  closeCode: orMissing(Schema.Number),
  kind: Schema.Literal("held"),
  raceId: Schema.String,
  rider: Schema.Number,
  tick: Schema.Number,
});

const Rejoined = Schema.Struct({
  awayMs: Schema.Number,
  catchUpTicks: Schema.Number,
  kind: Schema.Literal("rejoined"),
  raceId: Schema.String,
  rider: Schema.Number,
});

const Stats = Schema.Struct({
  kind: Schema.Literal("stats"),
  raceId: Schema.String,
  rider: Schema.Number,
  stats: Schema.Record(Schema.String, Schema.Number),
});

const Browser = Schema.Struct({
  build: Schema.String,
  gpu: Schema.String,
  graphics: Schema.String,
  kind: Schema.Literal("browser"),
  raceId: Schema.String,
  rider: Schema.Number,
});

const Ended = Schema.Struct({
  catchUpWakes: Schema.Number,
  dropped: orMissing(Schema.Number),
  kind: Schema.Literal("ended"),
  raceId: Schema.String,
  seats: Schema.Array(RaceSeatSchema),
  tick: Schema.Number,
  wakeGaps: Schema.Array(Schema.Number),
  worstBehindTicks: Schema.Number,
});

const TapeLost = Schema.Struct({
  key: Schema.String,
  kind: Schema.Literal("tapeLost"),
});

const Restored = Schema.Struct({
  afterMs: Schema.Number,
  build: Schema.String,
  kind: Schema.Literal("restored"),
  raceId: Schema.String,
  tick: Schema.Number,
});

export const LOST_REASONS = ["noCheckpoint", "pastHold", "refused"] as const;

export type LostReason = (typeof LOST_REASONS)[number];

const Lost = Schema.Struct({
  afterMs: Schema.Number,
  build: Schema.String,
  detail: orMissing(Schema.String),
  kind: Schema.Literal("lost"),
  raceId: Schema.String,
  reason: Schema.Literals(LOST_REASONS),
  tick: Schema.Number,
});

export const MEMORY_MOMENTS = ["read", "write"] as const;

const MemoryLost = Schema.Struct({
  detail: orMissing(Schema.String),
  kind: Schema.Literal("memoryLost"),
  when: Schema.Literals(MEMORY_MOMENTS),
});

const Placed = Schema.Struct({
  kind: Schema.Literal("placed"),
  riders: Schema.Number,
  waitedMs: Schema.Number,
});

export const RoomNoteSchema = Schema.Union([
  Placed,
  Refused,
  TapeLost,
  MemoryLost,
  Started,
  Restored,
  Lost,
  Countdown,
  Left,
  Held,
  Rejoined,
  Stats,
  Browser,
  Ended,
]);

export type RoomNote = typeof RoomNoteSchema.Type;
export type RaceStarted = typeof Started.Type;
export type RaceEnded = typeof Ended.Type;
export type RaceCountdown = typeof Countdown.Type;
export type RaceStatsNote = typeof Stats.Type;
export type RaceBrowserNote = typeof Browser.Type;
export type RaceLeft = typeof Left.Type;
export type RaceHeld = typeof Held.Type;
export type RaceRejoined = typeof Rejoined.Type;
export type RaceRestored = typeof Restored.Type;
export type RaceLost = typeof Lost.Type;
