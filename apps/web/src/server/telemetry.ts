import { MAX_REQUEST_BYTES } from "@racer/telemetry/limits";
import { decodeBatchEffect } from "@racer/telemetry/schema";
import type { Ack } from "@racer/telemetry/schema";
import { TelemetryStore } from "@racer/telemetry/store";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Invalid } from "./refusals/invalid.ts";
import { NoStore } from "./refusals/no-store.ts";
import { NotJson } from "./refusals/not-json.ts";
import { StoreFailed } from "./refusals/store-failed.ts";
import { TooLarge } from "./refusals/too-large.ts";

type Refusal = TooLarge | NotJson | Invalid | NoStore | StoreFailed;

const publicIssue = {
  Invalid: "Invalid telemetry batch.",
  StoreFailed: "Telemetry storage failed.",
} as const;

const statusOf = {
  Invalid: 400,
  NoStore: 503,
  NotJson: 400,
  StoreFailed: 500,
  TooLarge: 413,
} as const satisfies Record<Refusal["_tag"], number>;

const decodeJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Unknown)
);

const publicBody = Match.type<Refusal>().pipe(
  Match.tagsExhaustive({
    Invalid: (refusal) => ({ _tag: refusal._tag, issue: publicIssue.Invalid }),
    NoStore: (refusal) => ({ _tag: refusal._tag }),
    NotJson: (refusal) => ({ _tag: refusal._tag }),
    StoreFailed: (refusal) => ({
      _tag: refusal._tag,
      issue: publicIssue.StoreFailed,
    }),
    TooLarge: (refusal) => ({ _tag: refusal._tag, bytes: refusal.bytes }),
  })
);

const reply = (
  status: number,
  body: Ack | ReturnType<typeof publicBody>
): Response =>
  Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });

const declaredLength = (request: Request): number =>
  Number(request.headers.get("content-length") ?? 0);

const readBody = Effect.fn("telemetry.readBody")(function* readBody(
  request: Request
) {
  const declared = declaredLength(request);
  if (declared > MAX_REQUEST_BYTES) {
    return yield* new TooLarge({ bytes: declared });
  }
  const text = yield* Effect.tryPromise({
    catch: (cause) => new NotJson({ cause }),
    try: async () => await request.text(),
  });
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_REQUEST_BYTES) {
    return yield* new TooLarge({ bytes });
  }
  return text;
});

export const ingest = Effect.fn("telemetry.ingest")(function* ingest(
  request: Request
) {
  const store = yield* TelemetryStore;
  const text = yield* readBody(request);
  const value = yield* decodeJson(text).pipe(
    Effect.mapError((cause) => new NotJson({ cause }))
  );
  const batch = yield* decodeBatchEffect(value).pipe(
    Effect.mapError((cause) => new Invalid({ cause }))
  );
  const receivedAt = DateTime.formatIso(
    DateTime.makeUnsafe(yield* Clock.currentTimeMillis)
  );
  const saved = yield* store
    .save(batch, JSON.stringify({ batch, receivedAt }))
    .pipe(Effect.mapError((cause) => new StoreFailed({ cause })));
  const ack: Ack = {
    batchId: batch.batchId,
    duplicate: saved === "duplicate",
    sessionId: batch.session.sessionId,
  };
  return ack;
});

export const collect = (
  request: Request,
  store: Option.Option<Layer.Layer<TelemetryStore>>
): Effect.Effect<Response> => {
  const outcome: Effect.Effect<Ack, Refusal> = Option.match(store, {
    onNone: () => Effect.fail(new NoStore()),
    onSome: (layer) => ingest(request).pipe(Effect.provide(layer)),
  });
  return outcome.pipe(
    Effect.tapErrorTag("StoreFailed", (refusal) =>
      Effect.logError("Telemetry storage failed", refusal.cause)
    ),
    Effect.match({
      onFailure: (refusal) =>
        reply(statusOf[refusal._tag], publicBody(refusal)),
      onSuccess: (ack) => reply(200, ack),
    })
  );
};
