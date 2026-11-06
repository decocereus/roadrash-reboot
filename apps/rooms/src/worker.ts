import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";

import { gateLimiter, passes } from "./limiter.ts";
import { QueueServer } from "./queue-server.ts";
import { RaceServer } from "./race-server.ts";
import { refusedSeat } from "./refused-seat.ts";
import { route } from "./route.ts";

const THE_QUEUE = "public";

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
    const limiters = {
      queue: yield* gateLimiter("queue"),
      seat: yield* gateLimiter("seat"),
    };
    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        return yield* route(request, {
          pass: (door, client) => passes(limiters[door], client),
          queue: () => queues.getByName(THE_QUEUE).fetch(request),
          refuse: refusedSeat,
          room: (roomId) => races.getByName(roomId).fetch(request),
        });
      }),
    };
  }).pipe(Effect.provide(Cloudflare.RateLimitBinding))
) {}
