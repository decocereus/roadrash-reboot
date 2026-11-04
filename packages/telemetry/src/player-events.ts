import * as Schema from "effect/Schema";

import {
  browserFamilies,
  gameLoadStages,
  MAX_EVENTS_IN_BATCH,
  playerRaceEnds,
  raceChoices,
  roomArrivals,
  roomLostStages,
} from "./limits.ts";

const MAX_EVENT_AGE_MS = 86_400_000;
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Amount = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const text = (longest: number) =>
  Schema.String.check(Schema.isMaxLength(longest));

const GameOpened = Schema.Struct({
  browser: Schema.Literals(browserFamilies),
  event: Schema.Literal("game_opened"),
  graphicsCard: text(120),
  pixelRatio: Amount,
  screenHeight: Count,
  screenWidth: Count,
});

const GameReady = Schema.Struct({
  event: Schema.Literal("game_ready"),
  loadSeconds: Amount,
});

const GameLoadFailed = Schema.Struct({
  event: Schema.Literal("game_load_failed"),
  reason: text(160),
  stage: Schema.Literals(gameLoadStages),
});

const RacePicked = Schema.Struct({
  choice: Schema.Literals(raceChoices),
  event: Schema.Literal("race_picked"),
});

const RoomJoined = Schema.Struct({
  event: Schema.Literal("room_joined"),
  via: Schema.Literals(roomArrivals),
});

const InviteCopied = Schema.Struct({
  event: Schema.Literal("invite_copied"),
});

const RoomLost = Schema.Struct({
  event: Schema.Literal("room_lost"),
  stage: Schema.Literals(roomLostStages),
});

const RaceLoaded = Schema.Struct({
  event: Schema.Literal("race_loaded"),
  loadSeconds: Amount,
  qualityRung: Count,
});

const RaceStarted = Schema.Struct({
  bots: Count,
  event: Schema.Literal("race_started"),
  humans: Count,
  mode: Schema.Literals(raceChoices),
  raceId: text(64),
  road: text(40),
});

const RaceEnded = Schema.Struct({
  crashes: Count,
  event: Schema.Literal("race_ended"),
  place: Count,
  raceId: text(64),
  result: Schema.Literals(playerRaceEnds),
  roadMetres: Amount,
  seconds: Amount,
});

const RaceAgain = Schema.Struct({
  event: Schema.Literal("race_again"),
});

const PlayerEventSchema = Schema.Union([
  GameOpened,
  GameReady,
  GameLoadFailed,
  RacePicked,
  RoomJoined,
  InviteCopied,
  RoomLost,
  RaceLoaded,
  RaceStarted,
  RaceEnded,
  RaceAgain,
]);

export type PlayerEvent = typeof PlayerEventSchema.Type;

const PlayerEventBatchSchema = Schema.Struct({
  build: text(64),
  events: Schema.Array(
    Schema.Struct({
      agoMs: Amount.check(Schema.isLessThanOrEqualTo(MAX_EVENT_AGE_MS)),
      event: PlayerEventSchema,
    })
  ).check(Schema.isMaxLength(MAX_EVENTS_IN_BATCH)),
  playerId: Schema.String.check(
    Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f-]{27}$/u)
  ),
});

export type PlayerEventBatch = typeof PlayerEventBatchSchema.Type;

export const decodePlayerEventBatch = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PlayerEventBatchSchema)
);
