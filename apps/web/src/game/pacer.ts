export interface Pacer {
  readonly due: (now: number, refresh: number, pace: number) => boolean;
}

export const vsyncsPerFrame = (refresh: number, pace: number): number =>
  Math.max(1, Math.round(refresh / pace));

export const deliveredRate = (refresh: number, pace: number): number =>
  refresh / vsyncsPerFrame(refresh, pace);

export const createPacer = (): Pacer => {
  let next = Number.NEGATIVE_INFINITY;
  return {
    due(now, refresh, pace) {
      const vsyncs = vsyncsPerFrame(refresh, pace);
      if (vsyncs === 1) {
        next = now;
        return true;
      }
      const vsync = 1000 / refresh;
      if (now < next - vsync / 2) {
        return false;
      }
      const period = vsyncs * vsync;
      next = now - next > vsync / 2 ? now + period : next + period;
      return true;
    },
  };
};

const LOWEST_REFRESH = 60;
const REFRESH_WINDOW_MS = 1000;
const FEWEST_GAPS = 20;
const BASE_GAP_SHARE = 0.1;
const ONE_VSYNC_SPREAD = 1.5;
const SAME_RATE_SHARE = 0.03;
const CONFIRMING_READINGS = 2;

const readingOf = (gaps: readonly number[]): number | null => {
  if (gaps.length < FEWEST_GAPS) {
    return null;
  }
  const sorted = gaps.toSorted((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length * BASE_GAP_SHARE)] ?? 0;
  const single = sorted.filter((gap) => gap <= base * ONE_VSYNC_SPREAD);
  const mean = single.reduce((sum, gap) => sum + gap, 0) / single.length;
  return Math.max(LOWEST_REFRESH, Math.round(1000 / mean));
};

export interface RefreshMeter {
  readonly tick: (now: number) => number;
}

export const createRefreshMeter = (initial: number): RefreshMeter => {
  let refresh = initial;
  let start = Number.NaN;
  let last = Number.NaN;
  const gaps: number[] = [];
  let read = false;
  let candidate = Number.NaN;
  let candidateSeen = 0;

  const settle = (reading: number) => {
    if (!read) {
      read = true;
      refresh = reading;
      return;
    }
    if (Math.abs(reading - refresh) <= refresh * SAME_RATE_SHARE) {
      candidateSeen = 0;
      return;
    }
    const same = Math.abs(reading - candidate) <= reading * SAME_RATE_SHARE;
    candidateSeen = same ? candidateSeen + 1 : 1;
    candidate = reading;
    if (candidateSeen >= CONFIRMING_READINGS) {
      refresh = reading;
      candidateSeen = 0;
    }
  };

  return {
    tick(now) {
      if (Number.isNaN(last)) {
        start = now;
      } else {
        gaps.push(now - last);
      }
      last = now;
      if (now - start < REFRESH_WINDOW_MS) {
        return refresh;
      }
      const reading = readingOf(gaps);
      gaps.length = 0;
      start = now;
      if (reading !== null) {
        settle(reading);
      }
      return refresh;
    },
  };
};
