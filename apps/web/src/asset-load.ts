import { diagnostics } from "./diagnostics/hub.ts";
import type { AcquiredAssets, AssetParsers, Assets } from "./game/assets.ts";
import type * as Game from "./game/game.ts";
import type { GameEvents, GameHandle } from "./game/hud.ts";

export interface AssetRequest {
  readonly signal: AbortSignal;
  readonly parsers: AssetParsers;
  readonly loaded: (assets: Assets, release: () => void) => void;
  readonly failed: (error: Error) => void;
  readonly interrupted: () => void;
  readonly fontFallback: (error: Error) => void;
}

type GameModule = typeof Game;

const parsersOf = (game: Promise<GameModule>): AssetParsers => ({
  parts: async (bytes, url) => {
    const { assetParsers } = await game;
    return await assetParsers.parts(bytes, url);
  },
  rider: async (bytes, url) => {
    const { assetParsers } = await game;
    return await assetParsers.rider(bytes, url);
  },
  whole: async (bytes, url) => {
    const { assetParsers } = await game;
    return await assetParsers.whole(bytes, url);
  },
});

const acquire = async (
  game: Promise<GameModule>,
  signal: AbortSignal
): Promise<AcquiredAssets | null> => {
  const { browserAssetRuntime } = await import("./asset-runtime.ts");
  if (signal.aborted) {
    return null;
  }
  const { promise, reject, resolve } =
    Promise.withResolvers<AcquiredAssets | null>();
  browserAssetRuntime().mount({
    failed: reject,
    fontFallback: (error) => {
      diagnostics().recorder.fault("error", error.message, "fonts");
    },
    interrupted: () => {
      resolve(null);
    },
    loaded: (assets, release) => {
      resolve({ assets, release });
    },
    parsers: parsersOf(game),
    signal,
  });
  return await promise;
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
  try {
    return createGame(canvas, events, acquired);
  } catch (error) {
    acquired.release();
    throw error;
  }
};
