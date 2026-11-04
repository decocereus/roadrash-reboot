import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { RoomIdSchema } from "./contract.ts";
import { QueueServer } from "./queue-server.ts";
import { RaceServer } from "./race-server.ts";

const decodeRoomId = Schema.decodeUnknownOption(RoomIdSchema);
const ROOM_PATH = /^\/rooms\/(?<roomId>[^/]+)/u;
const QUEUE_PATH = /^\/queue(?:\/|$)/u;
const THE_QUEUE = "public";

const allowOthers = (
  response: HttpServerResponse.HttpServerResponse,
  path: string
): HttpServerResponse.HttpServerResponse =>
  path.endsWith("/seat")
    ? response
    : HttpServerResponse.setHeader(
        response,
        "access-control-allow-origin",
        "*"
      );

const props = Effect.map(
  Effect.all({
    build: Config.String("RUSHLINE_BUILD").pipe(Config.withDefault("local")),
    port: Config.Int("RUSHLINE_ROOMS_PORT").pipe(Config.withDefault(1352)),
  }),
  ({ build, port }) => ({
    dev: { port, strictPort: true },
    env: { RUSHLINE_BUILD: build },
    main: import.meta.url,
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: false, persist: true },
    },
  })
);

export default class Rooms extends Cloudflare.Worker<Rooms>()(
  "Rooms",
  props,
  Effect.gen(function* rooms() {
    const races = yield* RaceServer;
    const queues = yield* QueueServer;
    return {
      fetch: Effect.gen(function* route() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const path = new URL(request.url, "http://rooms").pathname;
        if (QUEUE_PATH.test(path)) {
          const response = yield* queues.getByName(THE_QUEUE).fetch(request);
          return allowOthers(response, path);
        }
        const roomId = decodeRoomId(ROOM_PATH.exec(path)?.groups?.roomId);
        if (Option.isNone(roomId)) {
          return HttpServerResponse.text("No room lives at this path.", {
            status: 404,
          });
        }
        const response = yield* races.getByName(roomId.value).fetch(request);
        return allowOthers(response, path);
      }),
    };
  })
) {}
