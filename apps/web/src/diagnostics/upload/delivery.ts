import { decodeAckEffect } from "@racer/telemetry/schema";
import * as Effect from "effect/Effect";

import { UPLOAD_ENDPOINT } from "../uploader.ts";
import type { Delivery, Entry } from "../uploader.ts";
import { UploadFailure } from "./failure.ts";

const INVALID_ACK = "collector acknowledgement invalid";

const post = (entry: Entry, send: typeof globalThis.fetch) =>
  Effect.tryPromise({
    catch: (cause) =>
      new UploadFailure({ cause, reason: "collector unreachable" }),
    try: async (signal) =>
      await send(UPLOAD_ENDPOINT, {
        body: entry.body,
        headers: { "content-type": "application/json" },
        method: "POST",
        signal,
      }),
  });

const acknowledgement = Effect.fn("telemetry.upload.acknowledgement")(
  function* acknowledgement(response: Response) {
    const body = yield* Effect.tryPromise({
      catch: (cause) => new UploadFailure({ cause, reason: INVALID_ACK }),
      try: async () => await response.json(),
    });
    return yield* decodeAckEffect(body).pipe(
      Effect.mapError(
        (cause) => new UploadFailure({ cause, reason: INVALID_ACK })
      )
    );
  }
);

export const deliver = Effect.fn("telemetry.upload.deliver")(
  function* deliver(entry: Entry, send: typeof globalThis.fetch) {
    const response = yield* post(entry, send);
    if (!response.ok) {
      const reason = `collector answered ${response.status}`;
      const refused: Delivery =
        response.status === 400 || response.status === 413
          ? { kind: "rejected", reason }
          : { kind: "retry", reason };
      return refused;
    }
    const ack = yield* acknowledgement(response);
    if (
      ack.sessionId !== entry.batch.session.sessionId ||
      ack.batchId !== entry.batch.batchId
    ) {
      return yield* new UploadFailure({ cause: ack, reason: INVALID_ACK });
    }
    const saved: Delivery = { kind: "saved" };
    return saved;
  },
  Effect.catchTag("UploadFailure", (failure) => {
    const retry: Delivery = { kind: "retry", reason: failure.reason };
    return Effect.succeed(retry);
  })
);
