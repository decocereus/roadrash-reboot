import type { RiderView } from "./race-view.ts";
import { TICK_SECONDS } from "./state.ts";
import type { RiderState } from "./state.ts";

export const TIMING_LINE_METRES = 50;
export const TIMING_LINES = 64;

const NO_CROSSING = -1;

export type Interval = number | "unknown" | "beyond";

export const lineAt = (s: number): number => Math.floor(s / TIMING_LINE_METRES);

const slotOf = (line: number): number =>
  ((line % TIMING_LINES) + TIMING_LINES) % TIMING_LINES;

export const createLines = (racer: boolean): Int32Array =>
  new Int32Array(racer ? TIMING_LINES : 0).fill(NO_CROSSING);

export const passLines = (tick: number, rider: RiderState): void => {
  const { lines } = rider;
  if (lines.length === 0) {
    return;
  }
  const line = lineAt(rider.bodyS);
  if (line <= rider.lineReached) {
    return;
  }
  const first = Math.max(rider.lineReached + 1, line - TIMING_LINES + 1);
  for (let next = first; next <= line; next += 1) {
    lines[slotOf(next)] = tick;
  }
  rider.lineReached = line;
};

const crossingTick = (ahead: RiderView, now: number, s: number): Interval => {
  const line = lineAt(s);
  if (line > ahead.lineReached || ahead.lines.length === 0) {
    return "unknown";
  }
  if (line <= ahead.lineReached - TIMING_LINES) {
    return "beyond";
  }
  const from = ahead.lines[slotOf(line)] ?? NO_CROSSING;
  if (from === NO_CROSSING) {
    return "unknown";
  }
  const fromS = line * TIMING_LINE_METRES;
  const onward = line < ahead.lineReached;
  const toS = onward ? fromS + TIMING_LINE_METRES : ahead.bodyS;
  const to = onward ? (ahead.lines[slotOf(line + 1)] ?? now) : now;
  if (toS <= fromS) {
    return from;
  }
  const share = Math.min(1, (s - fromS) / (toS - fromS));
  return from + (to - from) * share;
};

export const intervalAhead = (
  now: number,
  follower: RiderView,
  ahead: RiderView
): Interval => {
  if (follower.finishTick >= 0 && ahead.finishTick >= 0) {
    return (follower.finishTick - ahead.finishTick) * TICK_SECONDS;
  }
  const crossing = crossingTick(ahead, now, follower.bodyS);
  if (crossing === "unknown" || crossing === "beyond") {
    return crossing;
  }
  return (now - crossing) * TICK_SECONDS;
};
