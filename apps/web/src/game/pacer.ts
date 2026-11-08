export interface Pacer {
  readonly due: (now: number, refresh: number, pace: number) => boolean;
}

const ONE_VSYNC_SPREAD = 1.5;

const vsyncsPerFrame = (refresh: number, pace: number): number =>
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
const SAME_RATE_SHARE = 0.03;
const STRAY_SHARE = 0.1;

const sumOf = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0);

const agree = (one: number, other: number): boolean =>
  Math.abs(one - other) <= one * SAME_RATE_SHARE;

const keepsTime = (gaps: readonly number[], refresh: number): boolean => {
  const vsyncs = sumOf(gaps.map((gap) => vsyncsSpanned(gap, refresh)));
  return agree(sumOf(gaps), (vsyncs * 1000) / refresh);
};

const screenRate = (gaps: readonly number[]): number => {
  const sorted = gaps.toSorted((one, other) => one - other);
  const shortest = Math.min(
    ...sorted.slice(Math.floor(sorted.length * STRAY_SHARE))
  );
  const single = gaps.filter((gap) => Math.round(gap / shortest) === 1);
  return Math.round((single.length * 1000) / sumOf(single));
};

const rateOf = (gaps: readonly number[], refresh: number): number | null => {
  if (keepsTime(gaps, refresh)) {
    return refresh;
  }
  const rate = screenRate(gaps);
  return keepsTime(gaps, rate) ? rate : null;
};

export const createRefreshMeter = (initial: number) => {
  let refresh = initial;
  let start = Number.NaN;
  let last = Number.NaN;
  const gaps: number[] = [];
  let candidate = Number.NaN;

  const settle = (rate: number | null) => {
    const moved = rate !== null && rate !== refresh;
    if (moved && agree(candidate, rate)) {
      refresh = rate;
    }
    candidate = moved ? rate : Number.NaN;
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
    if (gaps.length >= FEWEST_GAPS) {
      settle(rateOf(gaps, refresh));
    }
    gaps.length = 0;
    start = now;
    return refresh;
  };
};
