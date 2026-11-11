import type { AssetRuntime } from "./asset-runtime.ts";
import type { BarCamera } from "./bar-view.ts";
import { diagnostics } from "./diagnostics/hub.ts";
import type {
  AcquiredAssets,
  AssetParsers,
  Assets,
  Decoded,
  LoadCelebrity,
  RiderAsset,
} from "./game/assets.ts";
import type { BarScene } from "./game/bar.ts";
import type { GameEvents, GameHandle } from "./game/hud.ts";

export interface LoadRequest<Value> {
  readonly signal: AbortSignal;
  readonly parsers: AssetParsers;
  readonly loaded: (value: Value, release: () => void) => void;
  readonly failed: (error: Error) => void;
  readonly interrupted: () => void;
}

export interface AssetRequest extends LoadRequest<Assets> {
  readonly fontFallback: (error: Error) => void;
}

export type CelebrityRequest = LoadRequest<RiderAsset>;

interface ParserModule {
  readonly assetParsers: AssetParsers;
}

const parsersOf = (module: Promise<ParserModule>): AssetParsers => ({
  parts: async (bytes, url) => {
    const { assetParsers } = await module;
    return await assetParsers.parts(bytes, url);
  },
  rider: async (bytes, url) => {
    const { assetParsers } = await module;
    return await assetParsers.rider(bytes, url);
  },
  walkers: async (bytes, url) => {
    const { assetParsers } = await module;
    return await assetParsers.walkers(bytes, url);
  },
  whole: async (bytes, url) => {
    const { assetParsers } = await module;
    return await assetParsers.whole(bytes, url);
  },
});

const held = async <Value>(
  signal: AbortSignal,
  module: Promise<ParserModule>,
  start: (request: LoadRequest<Value>) => void
): Promise<Decoded<Value> | null> => {
  const { promise, reject, resolve } =
    Promise.withResolvers<Decoded<Value> | null>();
  start({
    failed: reject,
    interrupted: () => {
      resolve(null);
    },
    loaded: (value, release) => {
      resolve({ release, value });
    },
    parsers: parsersOf(module),
    signal,
  });
  return await promise;
};

export const celebrityLoader =
  (
    mountCelebrity: AssetRuntime["mountCelebrity"],
    module: Promise<ParserModule>
  ): LoadCelebrity =>
  async (id, signal) =>
    await held<RiderAsset>(signal, module, (request) => {
      mountCelebrity(id, request);
    });

const acquire = async (
  game: Promise<ParserModule>,
  signal: AbortSignal
): Promise<AcquiredAssets | null> => {
  const { browserAssetRuntime } = await import("./asset-runtime.ts");
  if (signal.aborted) {
    return null;
  }
  const runtime = browserAssetRuntime();
  const assets = await held<Assets>(signal, game, (request) => {
    runtime.mount({
      ...request,
      fontFallback: (error) => {
        diagnostics().recorder.fault("error", error.message, "fonts");
      },
    });
  });
  return (
    assets && {
      assets: assets.value,
      loadCelebrity: celebrityLoader(runtime.mountCelebrity, game),
      release: assets.release,
    }
  );
};

export const bootGame = async (
  canvas: HTMLCanvasElement,
  events: GameEvents,
  signal: AbortSignal
): Promise<GameHandle | null> => {
  if (import.meta.env.SSR) {
    return null;
  }
  const game = import("./game/game.ts");
  const [acquired, { createGame }] = await Promise.all([
    acquire(game, signal),
    game,
  ]);
  if (acquired === null) {
    return null;
  }
  if (signal.aborted) {
    acquired.release();
    return null;
  }
  return createGame(canvas, events, acquired);
};

export const openBar = async (
  canvas: HTMLCanvasElement,
  startCamera: BarCamera,
  signal: AbortSignal
): Promise<BarScene | null> => {
  if (import.meta.env.SSR) {
    return null;
  }
  const bar = import("./game/bar.ts");
  const [acquired, { createBar }] = await Promise.all([
    acquire(bar, signal),
    bar,
  ]);
  if (acquired === null) {
    return null;
  }
  if (signal.aborted) {
    acquired.release();
    return null;
  }
  return createBar(
    canvas,
    {
      release: acquired.release,
      value: acquired.assets,
    },
    startCamera
  );
};
