import { MAX_REQUEST_BYTES } from "@racer/telemetry/limits";
import { decodeBatchEffect } from "@racer/telemetry/schema";
import type { Ack } from "@racer/telemetry/schema";
import type { TelemetryStore } from "@racer/telemetry/store";
import { Effect } from "effect";

type Refusal =
  | { readonly _tag: "TooLarge"; readonly bytes: number }
  | { readonly _tag: "NotJson" }
  | { readonly _tag: "Invalid"; readonly issue: string }
  | { readonly _tag: "NoStore" }
  | { readonly _tag: "StoreFailed"; readonly issue: string };

const ISSUE_LENGTH = 600;

const statusOf = {
  Invalid: 400,
  NoStore: 503,
  NotJson: 400,
  StoreFailed: 500,
  TooLarge: 413,
} as const satisfies Record<Refusal["_tag"], number>;

const reply = (status: number, body: Ack | Refusal): Response =>
  Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });

const tooLarge = (bytes: number): Refusal => ({ _tag: "TooLarge", bytes });

const declaredLength = (request: Request): number =>
  Number(request.headers.get("content-length") ?? 0);

const readBody = (request: Request) =>
  Effect.gen(function* readTelemetryBody() {
    const declared = declaredLength(request);
    if (declared > MAX_REQUEST_BYTES) {
      return yield* Effect.fail(tooLarge(declared));
    }
    const text = yield* Effect.tryPromise({
      catch: (): Refusal => ({ _tag: "NotJson" }),
      try: () => request.text(),
    });
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > MAX_REQUEST_BYTES) {
      return yield* Effect.fail(tooLarge(bytes));
    }
    return text;
  });

const ingest = (request: Request, store: TelemetryStore | null) =>
  Effect.gen(function* ingestBatch() {
    if (!store) {
      return yield* Effect.fail<Refusal>({ _tag: "NoStore" });
    }
    const text = yield* readBody(request);
    const value = yield* Effect.try({
      catch: (): Refusal => ({ _tag: "NotJson" }),
      try: () => JSON.parse(text),
    });
    const batch = yield* decodeBatchEffect(value).pipe(
      Effect.mapError((error): Refusal => ({
        _tag: "Invalid",
        issue: error.message.slice(0, ISSUE_LENGTH),
      }))
    );
    const line = JSON.stringify({
      batch,
      receivedAt: new Date().toISOString(),
    });
    const saved = yield* Effect.tryPromise({
      catch: (error): Refusal => ({
        _tag: "StoreFailed",
        issue: String(error).slice(0, ISSUE_LENGTH),
      }),
      try: () => store.save(batch, line),
    });
    const ack: Ack = {
      batchId: batch.batchId,
      duplicate: saved === "duplicate",
      sessionId: batch.session.sessionId,
    };
    return ack;
  });

export const ingestTelemetry = (
  request: Request,
  store: TelemetryStore | null
): Promise<Response> =>
  Effect.runPromise(
    ingest(request, store).pipe(
      Effect.match({
        onFailure: (refusal) => reply(statusOf[refusal._tag], refusal),
        onSuccess: (ack) => reply(200, ack),
      })
    )
  );
