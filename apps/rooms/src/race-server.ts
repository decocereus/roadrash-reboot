import * as Cloudflare from "alchemy/Cloudflare";
import * as Http from "alchemy/Http";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { RoomApi } from "./contract.ts";
import { createHost } from "./host.ts";
import type { HostPorts, HostSocket } from "./host.ts";
import { cleanGuestName, SEAT_CLOSED } from "./messages.ts";
import { NotWebSocket } from "./not-web-socket.ts";

const LOCAL_BUILD = "local";

const portsFor = (build: string): HostPorts => ({
  after: (ms, wake) => {
    setTimeout(wake, ms);
  },
  build,
  note: (note) => {
    console.log(JSON.stringify(note));
  },
  now: () => Date.now(),
  raceId: () => crypto.randomUUID(),
  seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
});

const EdgeSchema = Schema.Struct({
  clientTcpRtt: Schema.optional(Schema.Number),
  colo: Schema.optional(Schema.String),
});

const decodeEdge = Schema.decodeUnknownOption(EdgeSchema);

const linkOf = (edge: Option.Option<typeof EdgeSchema.Type>) =>
  Option.match(edge, {
    onNone: () => ({ colo: null, tcpRttMs: null }),
    onSome: ({ clientTcpRtt, colo }) => ({
      colo: colo ?? null,
      tcpRttMs: clientTcpRtt ?? null,
    }),
  });

const rawSocket = (socket: Cloudflare.WebSocket): HostSocket => socket.ws;

export class RaceServer extends Cloudflare.DurableObject<RaceServer>()(
  "RaceServer",
  Effect.gen(function* raceServer() {
    const state = yield* Cloudflare.DurableObjectState;
    const build = yield* Config.String("RUSHLINE_BUILD").pipe(
      Config.withDefault(LOCAL_BUILD),
      Effect.catchTag("ConfigError", () => Effect.succeed(LOCAL_BUILD))
    );
    return Effect.gen(function* raceServerInstance() {
      const host = createHost(portsFor(build));
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
              const url = new URL(request.url, "http://rooms");
              const name = cleanGuestName(url.searchParams.get("name") ?? "");
              host.seat(
                rawSocket(socket),
                name,
                linkOf(
                  decodeEdge(
                    request.source instanceof Request ? request.source.cf : null
                  )
                )
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
