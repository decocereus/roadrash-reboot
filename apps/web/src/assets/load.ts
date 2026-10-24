import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

import type { AssetParsers, Assets, Decoded, Parse } from "../game/assets.ts";
import { FontReadinessFailed } from "./font-readiness-failed.ts";
import { ModelDecodeFailed } from "./model-decode-failed.ts";
import { ModelRequestFailed } from "./model-request-failed.ts";
import { ModelResponseRejected } from "./model-response-rejected.ts";
import type { ModelUrls } from "./model-urls.ts";

const DISPLAY_FONT = '800 40px "Saira Extra Condensed"';

export interface Transport {
  readonly fetch: (
    url: string,
    init: RequestInit
  ) => ReturnType<typeof globalThis.fetch>;
}

export interface Fonts {
  readonly load: FontFaceSet["load"];
}

export const ModelTransport = Context.Service<Transport>(
  "@racer/web/ModelTransport"
);

export const AssetDecoder = Context.Service<AssetParsers>(
  "@racer/web/AssetDecoder"
);

export const FontReadiness = Context.Service<Fonts>("@racer/web/FontReadiness");

export type ByteCache = Map<string, ArrayBuffer>;

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const requestFailed = (url: string) => (cause: unknown) =>
  new ModelRequestFailed({ cause, message: messageOf(cause), url });

const download = Effect.fn("assets.download")(function* download(url: string) {
  const transport = yield* ModelTransport;
  const answer = yield* Effect.tryPromise({
    catch: requestFailed(url),
    try: async (signal) => {
      const response = await transport.fetch(url, { signal });
      return {
        bytes: response.ok ? await response.arrayBuffer() : null,
        status: response.status,
      };
    },
  });
  if (answer.bytes === null) {
    return yield* new ModelResponseRejected({
      message: `The model ${url} answered ${answer.status}.`,
      status: answer.status,
      url,
    });
  }
  return answer.bytes;
});

const retryable = (
  failure: ModelRequestFailed | ModelResponseRejected
): boolean => failure instanceof ModelRequestFailed || failure.status >= 500;

const modelBytes = (cache: ByteCache, url: string) =>
  Effect.suspend(() => {
    const cached = cache.get(url);
    if (cached !== undefined) {
      return Effect.succeed(cached);
    }
    return download(url).pipe(
      Effect.tap((bytes) =>
        Effect.sync(() => {
          cache.set(url, bytes);
        })
      )
    );
  }).pipe(Effect.retry({ times: 1, while: retryable }));

const kept = <Value, Failure, Services>(
  decoding: Effect.Effect<Decoded<Value>, Failure, Services>
) =>
  Effect.acquireRelease(decoding, (decoded) =>
    Effect.sync(decoded.release)
  ).pipe(Effect.map((decoded) => decoded.value));

const model = <Value>(
  cache: ByteCache,
  url: string,
  parse: (parsers: AssetParsers) => Parse<Value>
) =>
  Effect.gen(function* decodeModel() {
    const bytes = yield* modelBytes(cache, url);
    const parsers = yield* AssetDecoder;
    return yield* kept(
      Effect.tryPromise({
        catch: (cause) =>
          new ModelDecodeFailed({ cause, message: messageOf(cause), url }),
        try: async () => await parse(parsers)(bytes, url),
      })
    );
  });

const bikeParts = (parsers: AssetParsers) => parsers.parts;
const wholeModel = (parsers: AssetParsers) => parsers.whole;
const riderModel = (parsers: AssetParsers) => parsers.rider;

const displayFont = Effect.gen(function* loadDisplayFont() {
  const fonts = yield* FontReadiness;
  yield* Effect.tryPromise({
    catch: (cause) =>
      new FontReadinessFailed({ cause, message: messageOf(cause) }),
    try: async () => await fonts.load(DISPLAY_FONT),
  });
  return null;
}).pipe(
  Effect.catchTag("FontReadinessFailed", (failure) => Effect.succeed(failure))
);

interface Loaded {
  readonly assets: Assets;
  readonly fontFallback: FontReadinessFailed | null;
}

const bikeModels = (cache: ByteCache, { bikes }: ModelUrls) =>
  Effect.all(
    {
      classic: model(cache, bikes.classic, bikeParts),
      ghost: model(cache, bikes.ghost, bikeParts),
      oni: model(cache, bikes.oni, bikeParts),
      seraph: model(cache, bikes.seraph, bikeParts),
    },
    { concurrency: "unbounded" }
  );

export const loadBikes = Effect.fn("assets.loadBikes")(function* loadBikes(
  cache: ByteCache,
  urls: ModelUrls
) {
  return yield* bikeModels(cache, urls);
});

export const loadAssets = Effect.fn("assets.load")(function* loadAssets(
  cache: ByteCache,
  urls: ModelUrls
) {
  const [buildA, buildB, buildC] = urls.riders;
  const [bikes, car, van, riderA, riderB, riderC, fontFallback] =
    yield* Effect.all(
      [
        bikeModels(cache, urls),
        model(cache, urls.car, wholeModel),
        model(cache, urls.van, wholeModel),
        model(cache, buildA, riderModel),
        model(cache, buildB, riderModel),
        model(cache, buildC, riderModel),
        displayFont,
      ],
      { concurrency: "unbounded" }
    );
  const loaded: Loaded = {
    assets: { bikes, car, riders: [riderA, riderB, riderC], van },
    fontFallback,
  };
  return loaded;
});
