import * as Cloudflare from "alchemy/Cloudflare";
import * as Http from "alchemy/Http";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Layer from "effect/Layer";

import { RoomApi } from "./contract.ts";
import { createHost } from "./host.ts";
import type { HostPorts, HostSocket } from "./host.ts";
import { cleanGuestName, SEAT_CLOSED } from "./messages.ts";
import { NotWebSocket } from "./not-web-socket.ts";

const ports: HostPorts = {
  after: (ms, wake) => {
    setTimeout(wake, ms);
  },
  now: () => Date.now(),
  seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
};

const rawSocket = (socket: Cloudflare.WebSocket): HostSocket => socket.ws;

export class RaceServer extends Cloudflare.DurableObject<RaceServer>()(
  "RaceServer",
  Effect.gen(function* raceServer() {
    const state = yield* Cloudflare.DurableObjectState;
    return Effect.gen(function* raceServerInstance() {
      const host = createHost(ports);
      const handlers = HttpApiBuilder.group(RoomApi, "rooms", (group) =>
        group
          .handle("status", () => Effect.sync(host.status))
          .handleRaw("seat", ({ request }) =>
            Effect.gen(function* seat() {
              if (request.headers.upgrade?.toLowerCase() !== "websocket") {
                return yield* new NotWebSocket({
                  message: "A seat is a WebSocket upgrade.",
                });
              }
              const [response, socket] = yield* Cloudflare.upgrade();
              const asked = new URL(request.url, "http://rooms").searchParams;
              host.seat(
                rawSocket(socket),
                cleanGuestName(asked.get("name") ?? "")
              );
              return response;
            }).pipe(Effect.provideService(Cloudflare.DurableObjectState, state))
          )
      );
      const fetch = yield* HttpApiBuilder.layer(RoomApi).pipe(
        Layer.provide(handlers),
        Layer.provide(Http.Platform),
        HttpRouter.toHttpEffect
      );
      return {
        fetch,
        webSocketClose: (socket: Cloudflare.WebSocket) =>
          Effect.sync(() => {
            host.gone(rawSocket(socket));
            socket.ws.close(SEAT_CLOSED, "Seat closed.");
          }),
        webSocketError: (socket: Cloudflare.WebSocket) =>
          Effect.sync(() => {
            host.gone(rawSocket(socket));
          }),
        webSocketMessage: (
          socket: Cloudflare.WebSocket,
          message: string | ArrayBuffer
        ) =>
          Effect.sync(() => {
            host.message(rawSocket(socket), message);
          }),
      };
    });
  })
) {}
