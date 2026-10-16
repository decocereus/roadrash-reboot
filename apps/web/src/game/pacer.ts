export interface Pacer {
  readonly due: (now: number, refresh: number, pace: number) => boolean;
}

const LOWEST_REFRESH = 60;
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
const CONFIRMING_READINGS = 2;
const UNSETTLED_READINGS = 4;

const meanOf = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const readingOf = (gaps: readonly number[]): number | null => {
  if (gaps.length < FEWEST_GAPS) {
    return null;
  }
  const cutoff = meanOf(gaps) * MISSED_GAP_SHARE;
  const single = gaps.filter((gap) => gap <= cutoff);
  return Math.max(LOWEST_REFRESH, Math.round(1000 / meanOf(single)));
};

export interface RefreshMeter {
  readonly tick: (now: number) => number;
  readonly confirmed: boolean;
  readonly screenChanged: () => void;
}

export const createRefreshMeter = (initial: number): RefreshMeter => {
  let refresh = initial;
  let start = Number.NaN;
  let last = Number.NaN;
  const gaps: number[] = [];
  let confirmed = false;
  let candidate = Number.NaN;
  let candidateSeen = 0;
  let mayFall = false;
  const unsettled: number[] = [];

  const adopt = (rate: number) => {
    confirmed = true;
    mayFall = false;
    unsettled.length = 0;
    if (Math.abs(rate - refresh) > refresh * SAME_RATE_SHARE) {
      refresh = rate;
    }
  };

  const settle = (reading: number) => {
    if (!mayFall && reading < refresh * (1 - SAME_RATE_SHARE)) {
      candidate = Number.NaN;
      candidateSeen = 0;
      return;
    }
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
      return confirmed && !mayFall;
    },
    screenChanged() {
      mayFall = true;
      candidate = Number.NaN;
      candidateSeen = 0;
      gaps.length = 0;
      start = last;
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
