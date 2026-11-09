import * as Cloudflare from "alchemy/Cloudflare";
import * as Http from "alchemy/Http";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Layer from "effect/Layer";

import { roomsBuild } from "./build-id.ts";
import { QueueApi } from "./contract.ts";
import { SEAT_CLOSED } from "./messages.ts";
import { NotWebSocket } from "./not-web-socket.ts";
import type { HostSocket } from "./present.ts";
import { createQueue } from "./queue.ts";
import { launchRoomConfig } from "./room-config.ts";
import { publicRoomId } from "./room-id.ts";

const rawSocket = (socket: Cloudflare.WebSocket): HostSocket => socket.ws;

export class QueueServer extends Cloudflare.DurableObject<QueueServer>()(
  "QueueServer",
  Effect.gen(function* queueServer() {
    const state = yield* Cloudflare.DurableObjectState;
    const build = yield* roomsBuild.pipe(
      Effect.catchTag("ConfigError", (missing) => Effect.die(missing))
    );
    return Effect.gen(function* queueServerInstance() {
      const queue = createQueue({
        after: (ms, wake) => {
          setTimeout(wake, ms);
        },
        build,
        config: launchRoomConfig,
        note: (line) => {
          console.log(JSON.stringify(line));
        },
        now: () => Date.now(),
        roomId: publicRoomId,
      });
      const handlers = HttpApiBuilder.group(QueueApi, "queue", (group) =>
        group
          .handle("queueStatus", () => Effect.sync(queue.status))
          .handleRaw("queueSeat", ({ request }) =>
            Effect.gen(function* seat() {
              if (request.headers.upgrade?.toLowerCase() !== "websocket") {
                return yield* new NotWebSocket({
                  message: "A queue ticket is a WebSocket upgrade.",
                });
              }
              const [response, socket] = yield* Cloudflare.upgrade();
              const url = new URL(request.url, "http://rooms");
              queue.enter(rawSocket(socket), {
                build: url.searchParams.get("build") ?? "",
                key: url.searchParams.get("key") ?? crypto.randomUUID(),
                protocol: Number(url.searchParams.get("protocol")),
              });
              return response;
            }).pipe(Effect.provideService(Cloudflare.DurableObjectState, state))
          )
      );
      const fetch = yield* HttpApiBuilder.layer(QueueApi).pipe(
        Layer.provide(handlers),
        Layer.provide(Http.Platform),
        HttpRouter.toHttpEffect
      );
      return {
        fetch,
        webSocketClose: (socket: Cloudflare.WebSocket) =>
          Effect.sync(() => {
            queue.gone(rawSocket(socket));
            socket.ws.close(SEAT_CLOSED, "Ticket closed.");
          }),
        webSocketError: (socket: Cloudflare.WebSocket) =>
          Effect.sync(() => {
            queue.gone(rawSocket(socket));
          }),
        webSocketMessage: (
          socket: Cloudflare.WebSocket,
          message: string | ArrayBuffer
        ) =>
          Effect.sync(() => {
            queue.message(rawSocket(socket), message);
          }),
      };
    });
  })
) {}
