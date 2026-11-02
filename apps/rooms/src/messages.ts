import * as Schema from "effect/Schema";

export const RACE_ID_PATTERN = /^[a-z0-9-]{6,40}$/u;

const REQUEUED_ROOM = /-r(?<attempt>\d+)$/u;
const MOST_BASE_ID_CHARS = 34;

export const isRequeuedRoom = (raceId: string): boolean =>
  REQUEUED_ROOM.test(raceId);

export const nextRoomId = (raceId: string): string => {
  const attempt = Number(REQUEUED_ROOM.exec(raceId)?.groups?.attempt ?? 0) + 1;
  const base = raceId.replace(REQUEUED_ROOM, "").slice(0, MOST_BASE_ID_CHARS);
  return `${base}-r${attempt}`;
};

const Lobby = Schema.Struct({
  kind: Schema.Literal("lobby"),
  riders: Schema.Number,
  startsInMs: Schema.Number,
});

const Started = Schema.Struct({
  digest: Schema.Array(Schema.Number),
  kind: Schema.Literal("started"),
  seats: Schema.Number,
  seed: Schema.Number,
  startsInMs: Schema.Number,
  you: Schema.Number,
});

const Ended = Schema.Struct({
  kind: Schema.Literal("ended"),
  tick: Schema.Number,
});

const Refused = Schema.Struct({
  kind: Schema.Literal("refused"),
  reason: Schema.Literals(["full", "racing"]),
});

const RoomMessageSchema = Schema.Union([Lobby, Started, Ended, Refused]);

export type RoomMessage = typeof RoomMessageSchema.Type;

const RoomMessageJson = Schema.fromJsonString(RoomMessageSchema);

export const encodeRoomMessage = Schema.encodeSync(RoomMessageJson);
export const decodeRoomMessage = Schema.decodeUnknownOption(RoomMessageJson);

export const SEAT_CLOSED = 1000;
