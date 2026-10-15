import { governReasons } from "@racer/telemetry/limits";

const REPORT_MS = 500;

export interface FrameSample {
  intervalMs: number;
  discardedMs: number;
  pixelRatio: number;
  refresh: number;
  pace: number;
  rung: number;
  rungs: number;
  calls: number;
  triangles: number;
  changeFrom: number;
  changeTo: number;
  changeReason: number;
  changeAt: number;
  recording: boolean;
}

export const emptySample = (): FrameSample => ({
  calls: 0,
  changeAt: -1,
  changeFrom: 0,
  changeReason: 0,
  changeTo: 0,
  discardedMs: 0,
  intervalMs: 0,
  pace: 0,
  pixelRatio: 1,
  recording: false,
  refresh: 60,
  rung: 0,
  rungs: 1,
  triangles: 0,
});

export interface FrameMeter {
  frame: (sample: FrameSample) => void;
  dispose: () => void;
}

const style = (readout: HTMLElement): void => {
  Object.assign(readout.style, {
    background: "rgba(0, 0, 0, 0.55)",
    borderRadius: "4px",
    color: "#ffffff",
    contain: "layout paint style",
    font: "12px/1.4 ui-monospace, Menlo, monospace",
    padding: "4px 8px",
    pointerEvents: "none",
    position: "fixed",
    right: "8px",
    top: "8px",
    whiteSpace: "pre",
    willChange: "transform",
    zIndex: "60",
  });
};

export const wantsFrameMeter = (): boolean =>
  new URLSearchParams(globalThis.location.search).has("fps");

const changeLine = (sample: FrameSample, now: number): string => {
  if (sample.changeAt < 0) {
    return "no rung change yet";
  }
  const reason = governReasons[sample.changeReason] ?? "";
  const ago = Math.round((now - sample.changeAt) / 1000);
  return `rung ${sample.changeFrom}→${sample.changeTo} ${reason} ${ago} s ago`;
};

export const createFrameMeter = (beside: Node, session: string): FrameMeter => {
  const readout = document.createElement("output");
  style(readout);
  beside.parentNode?.append(readout);
  let frames = 0;
  let elapsed = 0;
  let worst = 0;
  let discarded = 0;
  return {
    dispose() {
      readout.remove();
    },
    frame(sample) {
      frames += 1;
      elapsed += sample.intervalMs;
      discarded += sample.discardedMs;
      worst = Math.max(worst, sample.intervalMs);
      if (elapsed < REPORT_MS) {
        return;
      }
      const fps = Math.round((frames * 1000) / elapsed);
      const mean = (elapsed / frames).toFixed(1);
      const peak = worst.toFixed(1);
      const lost = discarded > 0 ? `  lost ${Math.round(discarded)} ms` : "";
      const recording = sample.recording ? `\nrecording ${session}` : "";
      readout.textContent = `${fps} fps  ${mean} ms  worst ${peak} ms${lost}\n×${sample.pixelRatio.toFixed(2)}  rung ${sample.rung}/${sample.rungs - 1}  pace ${sample.pace}  display ${sample.refresh} Hz\n${sample.calls} calls  ${sample.triangles} tris\n${changeLine(sample, performance.now())}${recording}`;
      frames = 0;
      elapsed = 0;
      worst = 0;
      discarded = 0;
    },
  };
};
