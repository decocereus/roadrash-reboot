import { Schema } from "effect";

export const PROTOCOL_VERSION = 1 as const;
export const MAX_PLAYERS = 4 as const;

const Integer = Schema.Number.pipe(Schema.check(Schema.isInt()));
const NonNegativeInteger = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);
const Place = Schema.optional(
  Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
);
const OptionalString = Schema.optional(Schema.String);

export const RoomPhase = Schema.Literals([
  "lobby",
  "countdown",
  "racing",
  "finished",
  "aborted",
] as const);
export type RoomPhase = Schema.Schema.Type<typeof RoomPhase>;

export const InputState = Schema.Struct({
  steer: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -1, maximum: 1 }))),
  throttle: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  brake: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  attack: Schema.Boolean,
});
export type InputState = Schema.Schema.Type<typeof InputState>;

export const PlayerState = Schema.Struct({
  playerId: Schema.String,
  displayName: Schema.String,
  kind: Schema.Literals(["human", "bot"] as const),
  lane: Schema.Number,
  roadDistance: Schema.Number,
  speed: Schema.Number,
  health: Schema.Number,
  status: Schema.Literals(["active", "crashed", "finished"] as const),
  crashTicksRemaining: Integer,
  attackCooldownTicks: Integer,
  attackTicksRemaining: Integer,
  hitStunTicksRemaining: Integer,
  place: Place,
  lastHitBy: OptionalString,
});
export type PlayerState = Schema.Schema.Type<typeof PlayerState>;

export const TrafficState = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["vehicle", "obstacle"] as const),
  lane: Schema.Number,
  distance: Schema.Number,
  speed: Schema.Number,
  collisionCooldownTicks: Integer,
});
export type TrafficState = Schema.Schema.Type<typeof TrafficState>;

export const RaceEvent = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("attack"),
    attackerId: Schema.String,
    targetId: OptionalString,
  }),
  Schema.Struct({
    kind: Schema.Literal("hit"),
    attackerId: Schema.String,
    targetId: Schema.String,
    damage: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal("traffic-collision"),
    riderId: Schema.String,
    trafficId: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("rider-collision"),
    riderId: Schema.String,
    otherRiderId: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("crash"),
    riderId: Schema.String,
    cause: Schema.Literals(["attack", "traffic", "rider-collision"] as const),
  }),
  Schema.Struct({ kind: Schema.Literal("recover"), riderId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("finish"), riderId: Schema.String, place: Integer }),
]);
export type RaceEvent = Schema.Schema.Type<typeof RaceEvent>;

export const CreateRoom = Schema.Struct({ displayName: OptionalString });
export type CreateRoom = Schema.Schema.Type<typeof CreateRoom>;

export const JoinRoom = Schema.Struct({ displayName: OptionalString });
export type JoinRoom = Schema.Schema.Type<typeof JoinRoom>;

export const ClientMessage = Schema.Union([
  Schema.Struct({
    protocol: Schema.Literal(PROTOCOL_VERSION),
    type: Schema.Literal("join"),
    ticket: Schema.String,
    displayName: OptionalString,
  }),
  Schema.Struct({
    protocol: Schema.Literal(PROTOCOL_VERSION),
    type: Schema.Literal("input"),
    sequence: NonNegativeInteger,
    input: InputState,
  }),
  Schema.Struct({
    protocol: Schema.Literal(PROTOCOL_VERSION),
    type: Schema.Literal("ping"),
    clientTime: Schema.Number,
  }),
  Schema.Struct({
    protocol: Schema.Literal(PROTOCOL_VERSION),
    type: Schema.Literal("start"),
  }),
]);
export type ClientMessage = Schema.Schema.Type<typeof ClientMessage>;

export const RoomStateMessage = Schema.Struct({
  protocol: Schema.Literal(PROTOCOL_VERSION),
  type: Schema.Literal("room_state"),
  roomCode: Schema.String,
  phase: RoomPhase,
  hostPlayerId: Schema.String,
  players: Schema.Array(PlayerState),
  maxPlayers: Schema.Literal(MAX_PLAYERS),
});
export type RoomStateMessage = Schema.Schema.Type<typeof RoomStateMessage>;

export const RaceSnapshotMessage = Schema.Struct({
  protocol: Schema.Literal(PROTOCOL_VERSION),
  type: Schema.Literal("race_snapshot"),
  tick: Integer,
  serverTime: Schema.Number,
  phase: Schema.Literals(["racing", "finished", "aborted"] as const),
  countdownTicksRemaining: NonNegativeInteger,
  elapsedSeconds: Schema.Number,
  trackLength: Schema.Number,
  finishCount: Integer,
  seed: Integer,
  riders: Schema.Array(PlayerState),
  traffic: Schema.Array(TrafficState),
  events: Schema.Array(RaceEvent),
});
export type RaceSnapshotMessage = Schema.Schema.Type<typeof RaceSnapshotMessage>;

export const RaceEventMessage = Schema.Struct({
  protocol: Schema.Literal(PROTOCOL_VERSION),
  type: Schema.Literal("race_event"),
  event: RaceEvent,
  tick: Integer,
});
export type RaceEventMessage = Schema.Schema.Type<typeof RaceEventMessage>;

export const ErrorMessage = Schema.Struct({
  protocol: Schema.Literal(PROTOCOL_VERSION),
  type: Schema.Literal("error"),
  code: Schema.Literals([
    "bad_request",
    "room_not_found",
    "room_full",
    "not_host",
    "already_started",
    "not_joined",
    "invalid_input",
  ] as const),
  message: Schema.String,
});
export type ErrorMessage = Schema.Schema.Type<typeof ErrorMessage>;

export const PongMessage = Schema.Struct({
  protocol: Schema.Literal(PROTOCOL_VERSION),
  type: Schema.Literal("pong"),
  clientTime: Schema.Number,
  serverTime: Schema.Number,
});
export type PongMessage = Schema.Schema.Type<typeof PongMessage>;

export type ServerMessage =
  | RoomStateMessage
  | RaceSnapshotMessage
  | RaceEventMessage
  | ErrorMessage
  | PongMessage;

export const decodeClientMessage = Schema.decodeUnknownResult(ClientMessage);

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

export function clampDisplayName(value: string | undefined, fallback: string): string {
  const name = value
    ?.trim()
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .slice(0, 20);
  return name && name.length > 0 ? name : fallback;
}
