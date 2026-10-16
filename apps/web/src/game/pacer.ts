export interface Pacer {
  readonly due: (now: number, refresh: number, pace: number) => boolean;
}

const ONE_VSYNC_SPREAD = 1.5;

export const vsyncsPerFrame = (refresh: number, pace: number): number =>
  Math.max(1, Math.round(refresh / pace));

const vsyncsSpanned = (gap: number, refresh: number): number => {
  const vsync = 1000 / refresh;
  return gap > vsync * ONE_VSYNC_SPREAD ? Math.round(gap / vsync) : 1;
};

export const createPacer = (): Pacer => {
  let last = Number.NaN;
  let waited = 0;
  return {
    due(now, refresh, pace) {
      waited += Number.isNaN(last) ? 1 : vsyncsSpanned(now - last, refresh);
      last = now;
      if (waited < vsyncsPerFrame(refresh, pace)) {
        return false;
      }
      waited = 0;
      return true;
    },
  };
};

const REFRESH_WINDOW_MS = 1000;
const FEWEST_GAPS = 20;
const MISSED_GAP_SHARE = 1.75;
const SAME_RATE_SHARE = 0.03;

const meanOf = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const readingOf = (gaps: readonly number[]): number | null => {
  if (gaps.length < FEWEST_GAPS) {
    return null;
  }
  const cutoff = meanOf(gaps) * MISSED_GAP_SHARE;
  const single = gaps.filter((gap) => gap <= cutoff);
  return Math.round(1000 / meanOf(single));
};

const agree = (one: number, other: number): boolean =>
  Math.abs(one - other) <= one * SAME_RATE_SHARE;

export const createRefreshMeter = (initial: number) => {
  let refresh = initial;
  let start = Number.NaN;
  let last = Number.NaN;
  const gaps: number[] = [];
  let candidate = Number.NaN;

  const settle = (reading: number) => {
    const higher = reading > refresh && !agree(refresh, reading);
    if (higher && agree(candidate, reading)) {
      refresh = reading;
    }
    candidate = higher ? reading : Number.NaN;
  };

  return (now: number): number => {
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
  };
};
