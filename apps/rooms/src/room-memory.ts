import { seatsCapacity } from "@racer/sim/room";
import type { Room } from "@racer/sim/room";
import type { TapeWriter } from "@racer/sim/room-tape";
import { snapshotCapacity, writeSnapshot } from "@racer/sim/snapshot";
import * as Schema from "effect/Schema";

import { RaceManifestSchema } from "./manifest.ts";
import { RoomRuleSchema } from "./room-rule.ts";

export const MEMORY_VERSION = 1;
export const CHECKPOINT_TICKS = 300;

const MemberMemorySchema = Schema.Struct({
  colour: Schema.Number,
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
});

const LobbyMemorySchema = Schema.Struct({
  joined: Schema.Number,
  members: Schema.Array(MemberMemorySchema),
  rule: RoomRuleSchema,
});

export type LobbyMemory = typeof LobbyMemorySchema.Type;

const SeatMemorySchema = Schema.Struct({
  accepted: Schema.Number,
  ahead: Schema.Number,
  colour: Schema.Number,
  late: Schema.Number,
  leftAtTick: Schema.NullOr(Schema.Number),
  link: Schema.Struct({
    asn: Schema.NullOr(Schema.Number),
    colo: Schema.NullOr(Schema.String),
    network: Schema.NullOr(Schema.String),
    tcpRttMs: Schema.NullOr(Schema.Number),
  }),
  memberId: Schema.String,
  name: Schema.String,
  readyMs: Schema.NullOr(Schema.Number),
  reported: Schema.Boolean,
  rider: Schema.Number,
});

export type SeatMemory = typeof SeatMemorySchema.Type;

const CheckpointSchema = Schema.Struct({
  controls: Schema.Uint8Array,
  seats: Schema.Array(SeatMemorySchema),
  snapshot: Schema.Uint8Array,
  tape: Schema.Struct({
    parts: Schema.Number,
    tail: Schema.Struct({ bytes: Schema.Uint8Array, ticks: Schema.Number }),
  }),
  tick: Schema.Number,
});

export type Checkpoint = typeof CheckpointSchema.Type;

const RaceMemorySchema = Schema.Struct({
  checkpoint: Schema.NullOr(CheckpointSchema),
  manifest: RaceManifestSchema,
  raceId: Schema.String,
});

export type RaceMemory = typeof RaceMemorySchema.Type;

const UnsavedSchema = Schema.Struct({
  body: Schema.Union([Schema.String, Schema.Uint8Array]),
  key: Schema.String,
});

export type Unsaved = typeof UnsavedSchema.Type;

const RoomMemorySchema = Schema.Struct({
  at: Schema.Number,
  build: Schema.String,
  lobby: LobbyMemorySchema,
  lostRace: Schema.NullOr(Schema.String),
  race: Schema.NullOr(RaceMemorySchema),
  unsaved: Schema.Array(UnsavedSchema),
  version: Schema.Literal(MEMORY_VERSION),
});

export type RoomMemory = typeof RoomMemorySchema.Type;

export const decodeRoomMemory = Schema.decodeUnknownOption(RoomMemorySchema);

export const checkpointOf = (
  room: Room,
  tape: TapeWriter,
  seats: readonly SeatMemory[]
): Checkpoint => {
  const snapshot = new Uint8Array(snapshotCapacity(room.state));
  writeSnapshot(room.state, room.digest, new DataView(snapshot.buffer));
  const controls = new Uint8Array(seatsCapacity(seats.length));
  room.writeSeats(new DataView(controls.buffer));
  return {
    controls,
    seats,
    snapshot,
    tape: { parts: tape.parts(), tail: tape.tail() },
    tick: room.state.tick,
  };
};
