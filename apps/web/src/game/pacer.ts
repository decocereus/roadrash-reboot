export interface Pacer {
  readonly present: (now: number, refresh: number, pace: number) => number;
}

export const LOWEST_REFRESH = 60;
const ONE_VSYNC_SPREAD = 1.5;

export const vsyncsPerFrame = (refresh: number, pace: number): number =>
  Math.max(1, Math.round(refresh / pace));

export const deliveredRate = (refresh: number, pace: number): number =>
  refresh / vsyncsPerFrame(refresh, pace);

const vsyncsSpanned = (gap: number, refresh: number): number => {
  const vsync = 1000 / refresh;
  return gap > vsync * ONE_VSYNC_SPREAD ? Math.round(gap / vsync) : 1;
};

export const createPacer = (): Pacer => {
  let last = Number.NaN;
  let waited = 0;
  return {
    present(now, refresh, pace) {
      waited += Number.isNaN(last) ? 1 : vsyncsSpanned(now - last, refresh);
      last = now;
      if (waited < vsyncsPerFrame(refresh, pace)) {
        return 0;
      }
      const spanned = waited;
      waited = 0;
      return spanned;
    },
  };
};

const REFRESH_WINDOW_MS = 1000;
const FEWEST_GAPS = 20;
const BASE_GAP_SHARE = 0.1;
const SAME_RATE_SHARE = 0.03;
const CONFIRMING_READINGS = 2;
const UNSETTLED_READINGS = 4;

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
  readonly confirmed: boolean;
}

export const createRefreshMeter = (initial: number): RefreshMeter => {
  let refresh = initial;
  let start = Number.NaN;
  let last = Number.NaN;
  const gaps: number[] = [];
  let confirmed = false;
  let candidate = Number.NaN;
  let candidateSeen = 0;
  const unsettled: number[] = [];

  const adopt = (rate: number) => {
    confirmed = true;
    unsettled.length = 0;
    if (Math.abs(rate - refresh) > refresh * SAME_RATE_SHARE) {
      refresh = rate;
    }
  };

  const settle = (reading: number) => {
    const same = Math.abs(reading - candidate) <= reading * SAME_RATE_SHARE;
    candidateSeen = same ? candidateSeen + 1 : 1;
    candidate = reading;
    if (candidateSeen >= CONFIRMING_READINGS) {
      adopt(reading);
      return;
    }
    if (confirmed) {
      return;
    }
    unsettled.push(reading);
    if (unsettled.length >= UNSETTLED_READINGS) {
      adopt(Math.min(...unsettled));
    }
  };

  return {
    get confirmed() {
      return confirmed;
    },
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
