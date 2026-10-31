import * as Effect from "effect/Effect";

import { ArtReadFailed } from "./art-read-failed.ts";

const IMMUTABLE = "public, max-age=31536000, immutable";

const refused = (status: number, text: string): Response =>
  new Response(text, { headers: { "cache-control": "no-store" }, status });

export const serveArt = Effect.fn("art.serve")(
  function* serveArt(bucket: R2Bucket, key: string) {
    const object = yield* Effect.tryPromise({
      catch: (cause) => new ArtReadFailed({ cause, key }),
      try: async () => await bucket.get(key),
    });
    if (object === null) {
      return refused(404, `No art is stored at ${key}.`);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", IMMUTABLE);
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  },
  Effect.catchTag("ArtReadFailed", (failure) =>
    Effect.as(
      Effect.logError("The art bucket could not be read.", failure),
      refused(502, "The art store could not be read.")
    )
  )
);
