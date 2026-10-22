import type { GameEvents, GameHandle } from "./game/hud.ts";

const startDownloads = async (): Promise<void> => {
  const { startModelDownloads } = await import("./game/models.ts");
  startModelDownloads();
};

export const bootGame = async (
  canvas: HTMLCanvasElement,
  events: GameEvents
): Promise<GameHandle> => {
  const [, { createGame }] = await Promise.all([
    startDownloads(),
    import("./game/game.ts"),
  ]);
  return await createGame(canvas, events);
};
