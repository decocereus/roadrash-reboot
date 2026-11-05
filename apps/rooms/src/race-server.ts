import * as Cloudflare from "alchemy/Cloudflare";
import * as Http from "alchemy/Http";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";

import { RoomApi } from "./contract.ts";
import { createHost } from "./host.ts";
import type { Host, HostPorts, HostSocket } from "./host.ts";
import { cleanGuestName, SEAT_CLOSED } from "./messages.ts";
import { NotWebSocket } from "./not-web-socket.ts";
import type { RoomNote } from "./notes.ts";
import { roomKindOf } from "./room-id.ts";
import { TAPE_KEEP_DAYS } from "./tape.ts";

const LOCAL_BUILD = "local";

const SECONDS_PER_DAY = 86_400;

const RaceTapes = Cloudflare.R2.Bucket("RaceTapes", {
  lifecycleRules: [
    {
      deleteObjectsTransition: {
        condition: { maxAge: TAPE_KEEP_DAYS * SECONDS_PER_DAY, type: "Age" },
      },
      id: "keep-tapes-seven-days",
    },
  ],
});

interface TapeSave {
  readonly body: string | Uint8Array;
  readonly key: string;
}

const note = (line: RoomNote): void => {
  console.log(JSON.stringify(line));
};

const TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";
const TRACE_TIMEOUT_MS = 3000;

const coloOfTrace = (trace: string): string | null =>
  /^colo=(?<colo>\w+)$/mu.exec(trace)?.groups?.colo ?? null;

const portsFor = (
  build: string,
  roomColo: HostPorts["roomColo"],
  saveTape: HostPorts["saveTape"]
): HostPorts => ({
  after: (ms, wake) => {
    setTimeout(wake, ms);
  },
  build,
  note,
  now: () => Date.now(),
  raceId: () => crypto.randomUUID(),
  roomColo,
  saveTape,
  seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
});

const EdgeSchema = Schema.Struct({
  asOrganization: Schema.optional(Schema.String),
  asn: Schema.optional(Schema.Number),
  clientTcpRtt: Schema.optional(Schema.Number),
  colo: Schema.optional(Schema.String),
});

const decodeEdge = Schema.decodeUnknownOption(EdgeSchema);

const linkOf = (edge: Option.Option<typeof EdgeSchema.Type>) =>
  Option.match(edge, {
    onNone: () => ({ asn: null, colo: null, network: null, tcpRttMs: null }),
    onSome: ({ asn, asOrganization, clientTcpRtt, colo }) => ({
      asn: asn ?? null,
      colo: colo ?? null,
      network: asOrganization ?? null,
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
    const tapes = yield* Cloudflare.R2.WriteBucket(RaceTapes);
    return Effect.gen(function* raceServerInstance() {
      const saves = yield* Queue.unbounded<TapeSave>();
      yield* Queue.take(saves).pipe(
        Effect.flatMap(({ body, key }) =>
          tapes.put(key, body).pipe(
            Effect.catchCause(() =>
              Effect.sync(() => {
                note({ key, kind: "tapeLost" });
              })
            )
          )
        ),
        Effect.forever,
        Effect.forkDetach
      );
      let roomColo: string | null = null;
      yield* Effect.tryPromise(async () => {
        const response = await globalThis.fetch(TRACE_URL, {
          signal: AbortSignal.timeout(TRACE_TIMEOUT_MS),
        });
        roomColo = coloOfTrace(await response.text());
      }).pipe(
        Effect.catchCause(() => Effect.void),
        Effect.forkDetach
      );
      let opened: Host | null = null;
      const hostOf = (roomId: string): Host => {
        opened ??= createHost(
          portsFor(
            build,
            () => roomColo,
            (key, body) => {
              Queue.offerUnsafe(saves, { body, key });
            }
          ),
          roomKindOf(roomId)
        );
        return opened;
      };
      const handlers = HttpApiBuilder.group(RoomApi, "rooms", (group) =>
        group
          .handle("status", ({ params }) =>
            Effect.sync(() => hostOf(params.roomId).status())
          )
          .handleRaw("seat", ({ params, request }) =>
            Effect.gen(function* seat() {
              if (request.headers.upgrade?.toLowerCase() !== "websocket") {
                return yield* new NotWebSocket({
                  message: "A seat is a WebSocket upgrade.",
                });
              }
              const [response, socket] = yield* Cloudflare.upgrade();
              const url = new URL(request.url, "http://rooms");
              const name = cleanGuestName(url.searchParams.get("name") ?? "");
              hostOf(params.roomId).seat(
                rawSocket(socket),
                name,
                linkOf(
                  decodeEdge(
                    request.source instanceof Request ? request.source.cf : null
                  )
                ),
                {
                  build: url.searchParams.get("build") ?? "",
                  key: url.searchParams.get("key") ?? crypto.randomUUID(),
                  protocol: Number(url.searchParams.get("protocol")),
                }
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
        webSocketClose: (socket: Cloudflare.WebSocket, closeCode: number) =>
          Effect.sync(() => {
            opened?.gone(rawSocket(socket), closeCode);
            socket.ws.close(SEAT_CLOSED, "Seat closed.");
          }),
        webSocketError: (socket: Cloudflare.WebSocket) =>
          Effect.sync(() => {
            opened?.gone(rawSocket(socket), null);
          }),
        webSocketMessage: (
          socket: Cloudflare.WebSocket,
          message: string | ArrayBuffer
        ) =>
          Effect.sync(() => {
            opened?.message(rawSocket(socket), message);
          }),
      };
    });
  }).pipe(Effect.provide(Cloudflare.R2.WriteBucketBinding))
) {}
