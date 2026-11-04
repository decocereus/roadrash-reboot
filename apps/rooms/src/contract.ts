import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";
import * as Schema from "effect/Schema";

import { ROOM_ID_PATTERN, ROOM_PHASES } from "./messages.ts";
import { NotWebSocket } from "./not-web-socket.ts";
import { SeatTallySchema } from "./notes.ts";

export const RoomIdSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(ROOM_ID_PATTERN)),
  Schema.brand("RoomId")
);

const RoomStatusSchema = Schema.Struct({
  catchUpWakes: Schema.Number,
  names: Schema.Array(Schema.String),
  phase: Schema.Literals(ROOM_PHASES),
  raceId: Schema.NullOr(Schema.String),
  seats: Schema.Array(SeatTallySchema),
  tick: Schema.Number,
  waiting: Schema.Number,
  wakes: Schema.Number,
  worstBehindTicks: Schema.Number,
});

export type RoomStatus = typeof RoomStatusSchema.Type;

const roomParams = { roomId: RoomIdSchema };

export const RoomApi = HttpApi.make("rooms").add(
  HttpApiGroup.make("rooms")
    .add(
      HttpApiEndpoint.get("status", "/rooms/:roomId", {
        params: roomParams,
        success: RoomStatusSchema,
      })
    )
    .add(
      HttpApiEndpoint.get("seat", "/rooms/:roomId/seat", {
        error: NotWebSocket.pipe(HttpApiSchema.status(426)),
        params: roomParams,
      })
    )
);
