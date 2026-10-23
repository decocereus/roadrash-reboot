import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as Scope from "effect/Scope";

import type { AssetRequest, BikeRequest, LoadRequest } from "./asset-load.ts";
import {
  AssetDecoder,
  FontReadiness,
  loadAssets,
  loadBike,
  ModelTransport,
} from "./assets/load.ts";
import type { ByteCache, Fonts, Transport } from "./assets/load.ts";
import { modelUrls } from "./assets/model-urls.ts";
import type { ModelUrls } from "./assets/model-urls.ts";
import type { AssetParsers } from "./game/assets.ts";

interface AssetServices {
  readonly fonts: Fonts;
  readonly transport: Transport;
}

interface AssetRuntime {
  readonly mount: (request: AssetRequest) => void;
  readonly mountBike: (request: BikeRequest) => void;
}

type Needs = AssetParsers | Fonts | Scope.Scope | Transport;

const errorOf = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export const createAssetRuntime = (
  { fonts, transport }: AssetServices,
  cache: ByteCache,
  urls: ModelUrls
): AssetRuntime => {
  const run = Effect.runForkWith(
    Context.make(ModelTransport, transport).pipe(
      Context.add(FontReadiness, fonts)
    )
  );

  const hold = <Value, Failure>(
    loading: Effect.Effect<Value, Failure, Needs>,
    request: LoadRequest<Value>
  ): void => {
    let loaded = false;
    const owned = Effect.gen(function* holdAssets() {
      const value = yield* loading;
      const self = yield* Effect.fiber;
      yield* Effect.sync(() => {
        loaded = true;
        request.loaded(value, () => {
          self.interruptUnsafe();
        });
      });
      return yield* Effect.never;
    });
    run(
      Effect.scoped(owned).pipe(
        Effect.provideService(AssetDecoder, request.parsers)
      ),
      { signal: request.signal }
    ).addObserver((exit) => {
      if (loaded || Exit.isSuccess(exit)) {
        return;
      }
      if (Cause.hasInterruptsOnly(exit.cause)) {
        request.interrupted();
      } else {
        request.failed(errorOf(Cause.squash(exit.cause)));
      }
    });
  };

  const mount = (request: AssetRequest): void => {
    hold(loadAssets(cache, urls), {
      ...request,
      loaded: ({ assets, fontFallback }, release) => {
        if (fontFallback !== null) {
          request.fontFallback(fontFallback);
        }
        request.loaded(assets, release);
      },
    });
  };

  const mountBike = (request: BikeRequest): void => {
    hold(loadBike(cache, urls), request);
  };

  return { mount, mountBike };
};

const pageCache: ByteCache = new Map();

export const browserAssetRuntime = (): AssetRuntime =>
  createAssetRuntime(
    {
      fonts: { load: document.fonts.load.bind(document.fonts) },
      transport: { fetch: globalThis.fetch.bind(globalThis) },
    },
    pageCache,
    modelUrls
  );
