import * as Schema from "effect/Schema";

export const ROOM_ID_PATTERN = /^[a-z0-9-]{6,40}$/u;

const REQUEUED_ROOM = /-r(?<attempt>\d+)$/u;
const REMATCH_ROOM = /-m(?<round>\d+)$/u;
const MOST_BASE_ID_CHARS = 34;
const MOST_NAME_CHARS = 12;
const BARRED_NAME_CHARS = /[^\p{L}\p{M}\p{N} ._-]/gu;
const UNNAMED_GUEST = "Rider";

export const cleanGuestName = (raw: string): string => {
  const name = raw
    .replace(BARRED_NAME_CHARS, "")
    .trim()
    .slice(0, MOST_NAME_CHARS)
    .trim();
  return name === "" ? UNNAMED_GUEST : name;
};

export const isRequeuedRoom = (roomId: string): boolean =>
  REQUEUED_ROOM.test(roomId);

export const nextRoomId = (roomId: string): string => {
  const attempt = Number(REQUEUED_ROOM.exec(roomId)?.groups?.attempt ?? 0) + 1;
  const base = roomId.replace(REQUEUED_ROOM, "").slice(0, MOST_BASE_ID_CHARS);
  return `${base}-r${attempt}`;
};

export const rematchRoomId = (roomId: string): string => {
  const room = roomId.replace(REQUEUED_ROOM, "");
  const round = Number(REMATCH_ROOM.exec(room)?.groups?.round ?? 0) + 1;
  const base = room.replace(REMATCH_ROOM, "").slice(0, MOST_BASE_ID_CHARS);
  return `${base}-m${round}`;
};

const Lobby = Schema.Struct({
  kind: Schema.Literal("lobby"),
  names: Schema.Array(Schema.String),
  riders: Schema.Number,
  startsInMs: Schema.Number,
});

const Started = Schema.Struct({
  digest: Schema.Array(Schema.Number),
  kind: Schema.Literal("started"),
  names: Schema.Array(Schema.String),
  raceId: Schema.String,
  seats: Schema.Number,
  seed: Schema.Number,
  you: Schema.Number,
});

const Countdown = Schema.Struct({
  kind: Schema.Literal("countdown"),
  startsInMs: Schema.Number,
});

const Ended = Schema.Struct({
  kind: Schema.Literal("ended"),
  tick: Schema.Number,
});

const Refused = Schema.Struct({
  kind: Schema.Literal("refused"),
  reason: Schema.Literals(["full", "racing"]),
});

const RoomMessageSchema = Schema.Union([
  Lobby,
  Started,
  Countdown,
  Ended,
  Refused,
]);

export type RoomMessage = typeof RoomMessageSchema.Type;
export type RoomStarted = typeof Started.Type;

const RoomMessageJson = Schema.fromJsonString(RoomMessageSchema);

export const encodeRoomMessage = Schema.encodeSync(RoomMessageJson);
export const decodeRoomMessage = Schema.decodeUnknownOption(RoomMessageJson);

export const ROOM_PHASES = ["waiting", "racing"] as const;

const RoomPresenceSchema = Schema.Struct({
  names: Schema.Array(Schema.String),
  phase: Schema.Literals(ROOM_PHASES),
});

export type RoomPresence = typeof RoomPresenceSchema.Type;

export const decodeRoomPresence = Schema.decodeUnknownOption(
  Schema.fromJsonString(RoomPresenceSchema)
);

export const SEAT_CLOSED = 1000;
