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

const REFRESH_RATES = [60, 75, 90, 120, 144, 165, 240];
const REFRESH_WINDOW_MS = 1000;

export const nearestRefresh = (rate: number): number => {
  let best = REFRESH_RATES[0] ?? 60;
  for (const candidate of REFRESH_RATES) {
    if (Math.abs(candidate - rate) < Math.abs(best - rate)) {
      best = candidate;
    }
  }
  return best;
};

export interface RefreshMeter {
  readonly tick: (now: number) => number | null;
}

export const createRefreshMeter = (): RefreshMeter => {
  let start = Number.NaN;
  let callbacks = 0;
  return {
    tick(now) {
      if (Number.isNaN(start)) {
        start = now;
        return null;
      }
      callbacks += 1;
      const elapsed = now - start;
      if (elapsed < REFRESH_WINDOW_MS) {
        return null;
      }
      const rate = (callbacks * 1000) / elapsed;
      start = now;
      callbacks = 0;
      return nearestRefresh(rate);
    },
  };
};
