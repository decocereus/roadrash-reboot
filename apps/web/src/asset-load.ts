import { diagnostics } from "./diagnostics/hub.ts";
import type {
  AcquiredAssets,
  AssetParsers,
  Assets,
  Decoded,
} from "./game/assets.ts";
import type * as Game from "./game/game.ts";
import type { GameEvents, GameHandle } from "./game/hud.ts";
import type { Showroom } from "./game/showroom.ts";

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

export type BikeRequest = LoadRequest<Assets["bike"]>;

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

const acquire = async (
  game: Promise<typeof Game>,
  signal: AbortSignal
): Promise<AcquiredAssets | null> => {
  const { browserAssetRuntime } = await import("./asset-runtime.ts");
  if (signal.aborted) {
    return null;
  }
  const assets = await held<Assets>(signal, game, (request) => {
    browserAssetRuntime().mount({
      ...request,
      fontFallback: (error) => {
        diagnostics().recorder.fault("error", error.message, "fonts");
      },
    });
  });
  return assets && { assets: assets.value, release: assets.release };
};

const acquireBike = async (
  showroom: Promise<ParserModule>,
  signal: AbortSignal
): Promise<Decoded<Assets["bike"]> | null> => {
  const { browserAssetRuntime } = await import("./asset-runtime.ts");
  if (signal.aborted) {
    return null;
  }
  return await held<Assets["bike"]>(signal, showroom, (request) => {
    browserAssetRuntime().mountBike(request);
  });
};

export const bootGame = async (
  canvas: HTMLCanvasElement,
  events: GameEvents,
  signal: AbortSignal
): Promise<GameHandle | null> => {
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

export const openShowroom = async (
  canvas: HTMLCanvasElement,
  signal: AbortSignal
): Promise<Showroom | null> => {
  const showroom = import("./game/showroom.ts");
  const [bike, { createShowroom }] = await Promise.all([
    acquireBike(showroom, signal),
    showroom,
  ]);
  if (bike === null) {
    return null;
  }
  if (signal.aborted) {
    bike.release();
    return null;
  }
  return createShowroom(canvas, bike);
};
