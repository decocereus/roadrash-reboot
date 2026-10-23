import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import type { AssetRequest } from "./asset-load.ts";
import {
  AssetDecoder,
  FontReadiness,
  loadAssets,
  ModelTransport,
} from "./assets/load.ts";
import type { ByteCache, Fonts, Transport } from "./assets/load.ts";
import { modelUrls } from "./assets/model-urls.ts";
import type { ModelUrls } from "./assets/model-urls.ts";

interface AssetServices {
  readonly fonts: Fonts;
  readonly transport: Transport;
}

interface AssetRuntime {
  readonly mount: (request: AssetRequest) => void;
}

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

  const mount = (request: AssetRequest): void => {
    let loaded = false;
    const owned = Effect.gen(function* holdAssets() {
      const { assets, fontFallback } = yield* loadAssets(cache, urls);
      const self = yield* Effect.fiber;
      yield* Effect.sync(() => {
        loaded = true;
        if (fontFallback !== null) {
          request.fontFallback(fontFallback);
        }
        request.loaded(assets, () => {
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

  return { mount };
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
