import * as Cloudflare from "alchemy/Cloudflare";
import * as Http from "alchemy/Http";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";

import { roomsBuild } from "./build-id.ts";
import { RoomApi } from "./contract.ts";
import { gatedClient, ROOM_LIMITED } from "./gate.ts";
import { createHost } from "./host.ts";
import type { Host, HostPorts } from "./host.ts";
import { gateLimiter, passes } from "./limiter.ts";
import { cleanGuestName, SEAT_CLOSED } from "./messages.ts";
import { NotWebSocket } from "./not-web-socket.ts";
import type { RoomNote } from "./notes.ts";
import type { HostSocket } from "./present.ts";
import { refusedSeat } from "./refused-seat.ts";
import { launchRoomConfig } from "./room-config.ts";
import { roomKindOf } from "./room-id.ts";
import { decodeRoomMemory } from "./room-memory.ts";
import type { RoomMemory } from "./room-memory.ts";
import { roomsSim } from "./sim-fingerprint.ts";
import { StorageFailed } from "./storage-failed.ts";
import { TAPE_KEEP_DAYS } from "./tape.ts";

const SECONDS_PER_DAY = 86_400;
const MEMORY_KEY = "room";
const ENDED_KEY = "ended";
const WRITE_RETRIES = 5;

interface MemoryWrite {
  readonly key: string;
  readonly value: RoomMemory | number | null;
}

const decodeEnded = Schema.decodeUnknownOption(Schema.Number);

const durable = <A, R>(
  write: Effect.Effect<A, never, R>
): Effect.Effect<A, StorageFailed, R> =>
  write.pipe(
    Effect.catchCause(
      (cause) =>
        new StorageFailed({
          cause: Cause.squash(cause),
          message: Cause.pretty(cause),
        })
    ),
    Effect.retry({ times: WRITE_RETRIES })
  );

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
  readonly saved: () => void;
}

const note = (line: RoomNote): void => {
  console.log(JSON.stringify(line));
};

const MOST_WAITING_SAVES = 256;

const TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";
const TRACE_TIMEOUT_MS = 3000;

const coloOfTrace = (trace: string): string | null =>
  /^colo=(?<colo>\w+)$/mu.exec(trace)?.groups?.colo ?? null;

interface Durable {
  readonly endRace: HostPorts["endRace"];
  readonly remember: HostPorts["remember"];
  readonly saveTape: HostPorts["saveTape"];
}

const portsFor = (
  build: string,
  sim: string,
  roomColo: HostPorts["roomColo"],
  { endRace, remember, saveTape }: Durable
): HostPorts => ({
  after: (ms, wake) => {
    setTimeout(wake, ms);
  },
  build,
  config: launchRoomConfig,
  endRace,
  note,
  now: () => Date.now(),
  raceId: () => crypto.randomUUID(),
  remember,
  roomColo,
  saveTape,
  seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
  sim,
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
    const build = yield* roomsBuild.pipe(
      Effect.catchTag("ConfigError", (missing) => Effect.die(missing))
    );
    const sim = yield* roomsSim.pipe(
      Effect.catchTag("ConfigError", (missing) => Effect.die(missing))
    );
    const tapes = yield* Cloudflare.R2.WriteBucket(RaceTapes);
    const opens = yield* gateLimiter("open");
    return Effect.gen(function* raceServerInstance() {
      const saves = yield* Queue.dropping<TapeSave>(MOST_WAITING_SAVES);
      yield* Queue.take(saves).pipe(
        Effect.flatMap(({ body, key, saved }) =>
          tapes.put(key, body).pipe(
            Effect.retry({ times: WRITE_RETRIES }),
            Effect.tap(() => Effect.sync(saved)),
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
      const writes = yield* Queue.unbounded<MemoryWrite>();
      yield* Queue.take(writes).pipe(
        Effect.flatMap(({ key, value }) =>
          durable(
            value === null
              ? Effect.asVoid(state.storage.delete(key))
              : state.storage.put(key, value)
          ).pipe(
            Effect.catchTag("StorageFailed", (failure) =>
              Effect.sync(() => {
                note({
                  detail: failure.message,
                  kind: "memoryLost",
                  when: "write",
                });
              })
            )
          )
        ),
        Effect.forever,
        Effect.forkDetach
      );
      const stored = yield* state.storage.get(MEMORY_KEY);
      const remembered = Option.getOrNull(decodeRoomMemory(stored));
      if (stored !== undefined && remembered === null) {
        note({ detail: null, kind: "memoryLost", when: "read" });
      }
      const ended = Option.getOrElse(
        decodeEnded(yield* state.storage.get(ENDED_KEY)),
        () => 0
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
          portsFor(build, sim, () => roomColo, {
            endRace: (through) => {
              Queue.offerUnsafe(writes, { key: ENDED_KEY, value: through });
            },
            remember: (memory) => {
              Queue.offerUnsafe(writes, { key: MEMORY_KEY, value: memory });
            },
            saveTape: (key, body, saved) => {
              if (!Queue.offerUnsafe(saves, { body, key, saved })) {
                note({ key, kind: "tapeLost" });
              }
            },
          }),
          roomKindOf(roomId),
          remembered,
          ended
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
              const host = hostOf(params.roomId);
              const client = gatedClient(request.remoteAddress);
              if (
                host.status().waiting === 0 &&
                Option.isSome(client) &&
                !(yield* passes(opens, client.value))
              ) {
                return refusedSeat(ROOM_LIMITED);
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
                ),
                {
                  build: url.searchParams.get("build") ?? "",
                  key: url.searchParams.get("key") ?? crypto.randomUUID(),
                  protocol: Number(url.searchParams.get("protocol")),
                  rejoin: url.searchParams.get("rejoin") !== "no",
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
  }).pipe(
    Effect.provide([
      Cloudflare.R2.WriteBucketBinding,
      Cloudflare.RateLimitBinding,
    ])
  )
) {}
