import type { GraphicsPlace, GraphicsRecovery } from "@racer/telemetry/limits";
import type { PlayerEvent } from "@racer/telemetry/player-events";

export const RECOVERY_WAIT_MS = 30_000;

interface GraphicsLossParts {
  readonly after: (ms: number, run: () => void) => () => void;
  readonly place: () => GraphicsPlace;
  readonly track: (event: PlayerEvent) => void;
}

export type Drawing = "bar" | "game";

export interface GraphicsLoss {
  readonly leaving: () => void;
  readonly watch: (canvas: EventTarget, drawing: Drawing) => () => void;
}

export const createGraphicsLoss = ({
  after,
  place,
  track,
}: GraphicsLossParts): GraphicsLoss => {
  const down = new Set<EventTarget>();
  let barsDrawn = 0;
  let open: {
    readonly stopWaiting: () => void;
    readonly where: GraphicsPlace;
  } | null = null;

  const settle = (recovered: GraphicsRecovery): void => {
    if (open) {
      open.stopWaiting();
      track({ event: "graphics_lost", recovered, where: open.where });
      open = null;
    }
  };

  return {
    leaving: () => {
      settle("no");
    },
    watch(canvas, drawing) {
      if (drawing === "bar") {
        barsDrawn += 1;
      }
      const lost = (): void => {
        down.add(canvas);
        open ??= {
          stopWaiting: after(RECOVERY_WAIT_MS, () => {
            settle("no");
          }),
          where: barsDrawn > 0 ? "bar" : place(),
        };
      };
      const restored = (): void => {
        down.delete(canvas);
        if (down.size === 0) {
          settle("yes");
        }
      };
      canvas.addEventListener("webglcontextlost", lost);
      canvas.addEventListener("webglcontextrestored", restored);
      return () => {
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
        if (drawing === "bar") {
          barsDrawn -= 1;
        }
        if (down.delete(canvas)) {
          settle("no");
        }
      };
    },
  };
};
