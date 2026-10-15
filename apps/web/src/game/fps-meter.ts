const REPORT_SECONDS = 0.5;

export interface FrameSample {
  readonly seconds: number;
  readonly pixelRatio: number;
  readonly refresh: number;
  readonly pace: number;
  readonly rung: number;
  readonly rungs: number;
  readonly calls: number;
  readonly triangles: number;
}

export interface FrameMeter {
  frame: (sample: FrameSample) => void;
  dispose: () => void;
}

const style = (readout: HTMLElement): void => {
  Object.assign(readout.style, {
    background: "rgba(0, 0, 0, 0.55)",
    borderRadius: "4px",
    color: "#ffffff",
    font: "12px/1.4 ui-monospace, Menlo, monospace",
    left: "8px",
    padding: "4px 8px",
    pointerEvents: "none",
    position: "fixed",
    top: "8px",
    whiteSpace: "pre",
    zIndex: "60",
  });
};

export const wantsFrameMeter = (): boolean =>
  new URLSearchParams(globalThis.location.search).has("fps");

export const createFrameMeter = (beside: Node): FrameMeter => {
  const readout = document.createElement("output");
  style(readout);
  beside.parentNode?.append(readout);
  let frames = 0;
  let elapsed = 0;
  let worst = 0;
  return {
    dispose() {
      readout.remove();
    },
    frame({
      seconds,
      pixelRatio,
      refresh,
      pace,
      rung,
      rungs,
      calls,
      triangles,
    }) {
      frames += 1;
      elapsed += seconds;
      worst = Math.max(worst, seconds);
      if (elapsed < REPORT_SECONDS) {
        return;
      }
      const fps = Math.round(frames / elapsed);
      const mean = ((elapsed / frames) * 1000).toFixed(1);
      const peak = (worst * 1000).toFixed(1);
      readout.textContent = `${fps} fps  ${mean} ms  worst ${peak} ms\n×${pixelRatio.toFixed(2)}  rung ${rung}/${rungs - 1}  pace ${pace}  display ${refresh} Hz\n${calls} calls  ${triangles} tris`;
      frames = 0;
      elapsed = 0;
      worst = 0;
    },
  };
};
