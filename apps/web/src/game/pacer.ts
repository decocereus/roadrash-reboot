export interface Pacer {
  readonly present: (now: number, refresh: number, pace: number) => number;
  readonly cadence: number;
}

export const LOWEST_REFRESH = 60;
const ONE_VSYNC_SPREAD = 1.5;
const RECENT_GAPS = 16;
const STALE_SHARE = 0.1;
const AGREEING_SHARE = 0.05;
const CADENCE_HOLD_MS = 1000;

export const vsyncsPerFrame = (refresh: number, pace: number): number =>
  Math.max(1, Math.round(refresh / pace));

export const deliveredRate = (refresh: number, pace: number): number =>
  refresh / vsyncsPerFrame(refresh, pace);

const vsyncsSpanned = (gap: number, refresh: number): number => {
  const vsync = 1000 / refresh;
  return gap > vsync * ONE_VSYNC_SPREAD ? Math.round(gap / vsync) : 1;
};

const singleVsyncMean = (gaps: readonly number[]): number => {
  const sorted = gaps.toSorted((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length / 4)] ?? 0;
  const single = sorted.filter((gap) => gap <= base * ONE_VSYNC_SPREAD);
  return single.reduce((sum, gap) => sum + gap, 0) / single.length;
};

const observedRate = (recent: readonly number[]): number | null => {
  const mean = singleVsyncMean(recent);
  return recent.length >= RECENT_GAPS && mean > 0
    ? Math.round(1000 / mean)
    : null;
};

export const createPacer = (pinned = false): Pacer => {
  let last = Number.NaN;
  let waited = 0;
  let cadence = 1;
  let cadencePace = Number.NaN;
  let heldUntil = Number.NEGATIVE_INFINITY;
  let turn = 0;
  let observing = false;
  const recent: number[] = [];

  const rateFor = (refresh: number): number => {
    const observed = pinned ? null : observedRate(recent);
    if (observed === null) {
      return refresh;
    }
    const off = Math.abs(observed - refresh) / refresh;
    observing = off > (observing ? AGREEING_SHARE : STALE_SHARE);
    return observing ? observed : refresh;
  };

  const follow = (now: number, rate: number, pace: number) => {
    const wanted = vsyncsPerFrame(rate, pace);
    if (wanted === cadence) {
      return;
    }
    const direction = Math.sign(wanted - cadence);
    const reverses = pace === cadencePace && direction !== turn;
    if (reverses && now < heldUntil) {
      return;
    }
    cadence = wanted;
    cadencePace = pace;
    turn = direction;
    heldUntil = now + CADENCE_HOLD_MS;
  };
  return {
    get cadence() {
      return cadence;
    },
    present(now, refresh, pace) {
      const gap = now - last;
      last = now;
      if (!Number.isNaN(gap)) {
        recent.push(gap);
        recent.splice(0, recent.length - RECENT_GAPS);
      }
      const rate = rateFor(refresh);
      follow(now, rate, pace);
      waited += Number.isNaN(gap) ? 1 : vsyncsSpanned(gap, rate);
      if (waited < cadence) {
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
