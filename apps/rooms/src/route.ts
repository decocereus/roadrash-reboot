import * as Effect from "effect/Effect";
import type * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { RoomIdSchema } from "./contract.ts";
import { gatedClient, QUEUE_LIMITED, ROOM_LIMITED } from "./gate.ts";
import type { Gate } from "./gate.ts";

const decodeRoomId = Schema.decodeUnknownOption(RoomIdSchema);
const ROOM_PATH = /^\/rooms\/(?<roomId>[^/]+)/u;
const QUEUE_PATH = /^\/queue(?:\/|$)/u;
const SEAT_PATH = "/seat";

type Door = Exclude<Gate, "open">;

export interface RoutePorts<E, R> {
  readonly pass: (door: Door, client: string) => Effect.Effect<boolean, E, R>;
  readonly queue: () => Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    E,
    R
  >;
  readonly refuse: (message: string) => HttpServerResponse.HttpServerResponse;
  readonly room: (
    roomId: typeof RoomIdSchema.Type
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>;
}

const allowOthers = (
  response: HttpServerResponse.HttpServerResponse,
  path: string
): HttpServerResponse.HttpServerResponse =>
  path.endsWith(SEAT_PATH)
    ? response
    : HttpServerResponse.setHeader(
        response,
        "access-control-allow-origin",
        "*"
      );

export const route = Effect.fn("rooms.route")(function* route<E, R>(
  request: HttpServerRequest.HttpServerRequest,
  ports: RoutePorts<E, R>
) {
  const path = new URL(request.url, "http://rooms").pathname;
  const toQueue = QUEUE_PATH.test(path);
  const roomId = decodeRoomId(ROOM_PATH.exec(path)?.groups?.roomId);
  if (!toQueue && Option.isNone(roomId)) {
    return HttpServerResponse.text("No room lives at this path.", {
      status: 404,
    });
  }
  const client = gatedClient(request.remoteAddress);
  const upgrade = request.headers.upgrade?.toLowerCase() === "websocket";
  if (upgrade && path.endsWith(SEAT_PATH) && Option.isSome(client)) {
    const passed = yield* ports.pass(toQueue ? "queue" : "seat", client.value);
    if (!passed) {
      return ports.refuse(toQueue ? QUEUE_LIMITED : ROOM_LIMITED);
    }
  }
  const response = Option.isSome(roomId)
    ? yield* ports.room(roomId.value)
    : yield* ports.queue();
  return allowOthers(response, path);
});
