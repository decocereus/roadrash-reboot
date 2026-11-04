import { MAX_EVENT_BATCH_BYTES } from "@racer/telemetry/limits";
import { decodePlayerEventBatch } from "@racer/telemetry/player-events";
import type { PlayerEventBatch } from "@racer/telemetry/player-events";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Invalid } from "./refusals/invalid.ts";
import { NoStore } from "./refusals/no-store.ts";
import { NotForwarded } from "./refusals/not-forwarded.ts";
import type { NotJson } from "./refusals/not-json.ts";
import type { TooLarge } from "./refusals/too-large.ts";
import { readBody } from "./telemetry.ts";

const POSTHOG_BATCH_URL = "https://eu.i.posthog.com/batch/";
const FORWARD_TIMEOUT = "5 seconds";

type Refusal = Invalid | NoStore | NotForwarded | NotJson | TooLarge;

const statusOf = {
  Invalid: 400,
  NoStore: 503,
  NotForwarded: 502,
  NotJson: 400,
  TooLarge: 413,
} as const satisfies Record<Refusal["_tag"], number>;

const decodeEdge = Schema.decodeUnknownOption(
  Schema.Struct({ cf: Schema.Struct({ country: Schema.String }) })
);

const countryOf = (request: Request): Option.Option<string> =>
  decodeEdge(request).pipe(Option.map(({ cf }) => cf.country));

const captureBody = (
  key: string,
  { build, events, playerId }: PlayerEventBatch,
  now: number,
  country: Option.Option<string>
): string =>
  JSON.stringify({
    api_key: key,
    batch: events.map(({ agoMs, event: { event, ...facts } }) => ({
      distinct_id: playerId,
      event,
      properties: {
        ...facts,
        $geoip_disable: true,
        $process_person_profile: false,
        build,
        ...Option.match(country, {
          onNone: () => ({}),
          onSome: (code) => ({ country: code }),
        }),
      },
      timestamp: DateTime.formatIso(DateTime.makeUnsafe(now - agoMs)),
    })),
  });

const post = (body: string, send: typeof globalThis.fetch) =>
  Effect.tryPromise({
    catch: (cause) => new NotForwarded({ cause }),
    try: async (signal) =>
      await send(POSTHOG_BATCH_URL, {
        body,
        headers: { "content-type": "application/json" },
        method: "POST",
        signal,
      }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: FORWARD_TIMEOUT,
      orElse: () => Effect.fail(new NotForwarded({ cause: "timed out" })),
    })
  );

const forward = Effect.fn("events.forward")(function* forward(
  request: Request,
  key: string,
  send: typeof globalThis.fetch
) {
  if (key === "") {
    return yield* new NoStore();
  }
  const text = yield* readBody(request, MAX_EVENT_BATCH_BYTES);
  const batch = yield* decodePlayerEventBatch(text).pipe(
    Effect.mapError((cause) => new Invalid({ cause }))
  );
  const now = yield* Clock.currentTimeMillis;
  const answered = yield* post(
    captureBody(key, batch, now, countryOf(request)),
    send
  );
  if (!answered.ok) {
    return yield* new NotForwarded({ cause: answered.status });
  }
  return batch.events.length;
});

const refusedBody = Match.type<Refusal>().pipe(
  Match.tagsExhaustive({
    Invalid: ({ _tag }) => ({ _tag }),
    NoStore: ({ _tag }) => ({ _tag }),
    NotForwarded: ({ _tag }) => ({ _tag }),
    NotJson: ({ _tag }) => ({ _tag }),
    TooLarge: ({ _tag, bytes }) => ({ _tag, bytes }),
  })
);

export const forwardPlayerEvents = (
  request: Request,
  key: string,
  send: typeof globalThis.fetch
): Effect.Effect<Response> =>
  forward(request, key, send).pipe(
    Effect.tapErrorTag("NotForwarded", ({ cause }) =>
      Effect.logError("PostHog did not take a batch", String(cause))
    ),
    Effect.match({
      onFailure: (refusal) =>
        Response.json(refusedBody(refusal), {
          headers: { "cache-control": "no-store" },
          status: statusOf[refusal._tag],
        }),
      onSuccess: () => new Response(null, { status: 202 }),
    })
  );
