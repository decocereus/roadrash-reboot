import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";
import * as Schema from "effect/Schema";

import { RACE_ID_PATTERN } from "./messages.ts";
import { NotWebSocket } from "./not-web-socket.ts";

export const RaceIdSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(RACE_ID_PATTERN)),
  Schema.brand("RaceId")
);

const phases = ["waiting", "racing"] as const;

const SeatTally = Schema.Struct({
  accepted: Schema.Number,
  ahead: Schema.Number,
  late: Schema.Number,
  missed: Schema.Number,
  rider: Schema.Number,
});

const RoomStatusSchema = Schema.Struct({
  catchUpWakes: Schema.Number,
  phase: Schema.Literals(phases),
  seats: Schema.Array(SeatTally),
  tick: Schema.Number,
  waiting: Schema.Number,
  wakes: Schema.Number,
  worstBehindTicks: Schema.Number,
});

export type RoomStatus = typeof RoomStatusSchema.Type;

const raceParams = { raceId: RaceIdSchema };

export const RoomApi = HttpApi.make("rooms").add(
  HttpApiGroup.make("rooms")
    .add(
      HttpApiEndpoint.get("status", "/rooms/:raceId", {
        params: raceParams,
        success: RoomStatusSchema,
      })
    )
    .add(
      HttpApiEndpoint.get("seat", "/rooms/:raceId/seat", {
        error: NotWebSocket.pipe(HttpApiSchema.status(426)),
        params: raceParams,
      })
    )
);
