import type { GraphicsPlace, GraphicsRecovery } from "@racer/telemetry/limits";
import type { PlayerEvent } from "@racer/telemetry/player-events";

export const RECOVERY_WAIT_MS = 30_000;

interface GraphicsLossParts {
  readonly after: (ms: number, run: () => void) => () => void;
  readonly track: (event: PlayerEvent) => void;
}

export interface GraphicsLoss {
  readonly leaving: () => void;
  readonly watch: (
    canvas: EventTarget,
    place: () => GraphicsPlace
  ) => () => void;
}

export const createGraphicsLoss = ({
  after,
  track,
}: GraphicsLossParts): GraphicsLoss => {
  const places: (() => GraphicsPlace)[] = [];
  const down = new Set<EventTarget>();
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
    watch(canvas, place) {
      const lost = (): void => {
        down.add(canvas);
        open ??= {
          stopWaiting: after(RECOVERY_WAIT_MS, () => {
            settle("no");
          }),
          where: (places.at(-1) ?? place)(),
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
      places.push(place);
      return () => {
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
        places.splice(places.indexOf(place), 1);
        if (down.delete(canvas) && down.size === 0) {
          settle("no");
        }
      };
    },
  };
};
