import { lobbyActs, lobbyPlaces, lobbyPoses } from "@racer/sim/lobby-walk";
import * as Schema from "effect/Schema";

import { LOBBY_PHASES } from "./lobby.ts";
import { RaceManifestSchema } from "./manifest.ts";
import { RoomConfigSchema } from "./room-config.ts";
import { ROOM_KINDS } from "./room-id.ts";
import { RoomChoiceChangeSchema, RoomRuleSchema } from "./room-rule.ts";

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

const WALK_FIELDS = {
  heading: Schema.Finite,
  lean: Schema.Finite,
  pace: Schema.Finite,
  place: Schema.Literals(lobbyPlaces),
  pose: Schema.NullOr(Schema.Literals(lobbyPoses)),
  x: Schema.Finite,
  z: Schema.Finite,
};

const Walked = Schema.Struct({
  ...WALK_FIELDS,
  kind: Schema.Literal("walk"),
  member: Schema.String,
});

const Acted = Schema.Struct({
  act: Schema.Literals(lobbyActs),
  from: Schema.String,
  kind: Schema.Literal("act"),
  target: Schema.String,
});

const Lobby = Schema.Struct({
  atMs: Schema.Number,
  edition: Schema.Number,
  hostId: Schema.NullOr(Schema.String),
  kind: Schema.Literal("lobby"),
  members: Schema.Array(
    Schema.Struct({
      colour: Schema.Number,
      here: Schema.Boolean,
      id: Schema.String,
      name: Schema.String,
      ready: Schema.Boolean,
    })
  ),
  phase: Schema.Literals(LOBBY_PHASES),
  roomKind: Schema.Literals(ROOM_KINDS),
  rule: RoomRuleSchema,
  seatHoldSeconds: RoomConfigSchema.fields.seatHoldSeconds,
  startsInMs: Schema.NullOr(Schema.Number),
  you: Schema.String,
});

const Started = Schema.Struct({
  awayMs: Schema.NullOr(Schema.Number),
  kind: Schema.Literal("started"),
  manifest: RaceManifestSchema,
  you: Schema.Number,
});

const Countdown = Schema.Struct({
  kind: Schema.Literal("countdown"),
  startAtMs: Schema.Number,
});

const Ended = Schema.Struct({
  kind: Schema.Literal("ended"),
  tick: Schema.Number,
});

export const REFUSALS = [
  "build",
  "content",
  "full",
  "limited",
  "replaced",
] as const;

export type Refusal = (typeof REFUSALS)[number];

const Refused = Schema.Struct({
  kind: Schema.Literal("refused"),
  reason: Schema.Literals(REFUSALS),
});

const RoomMessageSchema = Schema.Union([
  Lobby,
  Started,
  Countdown,
  Ended,
  Refused,
  Walked,
  Acted,
]);

export type RoomMessage = typeof RoomMessageSchema.Type;
export type RoomLobbyMessage = typeof Lobby.Type;
export type RoomStarted = typeof Started.Type;
export type RoomWalked = typeof Walked.Type;
export type RoomActed = typeof Acted.Type;

const RoomMessageJson = Schema.fromJsonString(RoomMessageSchema);

export const encodeRoomMessage = Schema.encodeSync(RoomMessageJson);
export const decodeRoomMessage = Schema.decodeUnknownOption(RoomMessageJson);

const LobbyCommandSchema = Schema.Union([
  Schema.Struct({
    edition: Schema.Number,
    kind: Schema.Literal("ready"),
    ready: Schema.Boolean,
  }),
  Schema.Struct({
    choice: RoomChoiceChangeSchema,
    kind: Schema.Literal("choose"),
  }),
  Schema.Struct({ ...WALK_FIELDS, kind: Schema.Literal("walk") }),
  Schema.Struct({
    act: Schema.Literals(lobbyActs),
    kind: Schema.Literal("act"),
    target: Schema.String,
  }),
]);

export type LobbyCommand = typeof LobbyCommandSchema.Type;

const LobbyCommandJson = Schema.fromJsonString(LobbyCommandSchema);

export const encodeLobbyCommand = Schema.encodeSync(LobbyCommandJson);
export const decodeLobbyCommand = Schema.decodeUnknownOption(LobbyCommandJson);

export const ROOM_PHASES = ["waiting", "racing"] as const;

const RoomPreviewSchema = Schema.Struct({
  names: Schema.Array(Schema.String),
  phase: Schema.Literals(ROOM_PHASES),
  rule: RoomRuleSchema,
});

export type RoomPreview = typeof RoomPreviewSchema.Type;

export const decodeRoomPreview = Schema.decodeUnknownOption(
  Schema.fromJsonString(RoomPreviewSchema)
);

export const SEAT_CLOSED = 1000;
export const SEAT_LEFT = 4410;
export const SEAT_SILENT = 4408;
export const SEAT_QUIT = 4411;
