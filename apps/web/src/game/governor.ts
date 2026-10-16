import type { GovernReason } from "@racer/telemetry/limits";

export const BASE_RATE = 60;
const LATE_FRAME_FACTOR = 1.4;
const LATE_FRAMES_TO_STEP = 24;
const CALM_FRAME_CREDIT = 0.1;
const STEP_COOLDOWN_SECONDS = 5;
const BURST_WINDOW_SECONDS = 1;
const ROUGH_SHARE = 0.1;
const SEVERE_SHARE = 0.5;
const ROUGH_WINDOWS_TO_STEP = 2;
const BURST_COOLDOWN_SECONDS = 1;
const SEVERE_STEP = 2;
const GPU_BOUND_BUSY_MS = 10;
const RAISE_AFTER_CALM_SECONDS = 20;
const RETRY_AFTER_CALM_SECONDS = 300;
const RETRIES_PER_RUNG = 1;
const FAST_PACE_AFTER_CALM_SECONDS = 10;
const FAST_PACE_RETRY_SECONDS = 60;
const LONGEST_WAIT_SECONDS = 300;

export interface Verdict {
  readonly reason: GovernReason;
  readonly rung: number;
  readonly pace: number;
}

export interface Governor {
  readonly rung: number;
  readonly pace: number;
  readonly lateCredit: () => number;
  readonly calmSeconds: () => number;
  readonly judge: (
    seconds: number,
    busyMs: number,
    refresh: number
  ) => Verdict | null;
  readonly commit: (verdict: Verdict) => void;
  readonly startAt: (rung: number) => void;
  readonly resize: (rungs: number) => void;
}

export const createGovernor = (rungCount: number): Governor => {
  let rungs = rungCount;
  let rung = 0;
  let pace = BASE_RATE;
  let failures = new Uint8Array(rungs);
  let lateFrames = 0;
  let calm = 0;
  let sinceStep = STEP_COOLDOWN_SECONDS;
  let windowSeconds = 0;
  let windowFrames = 0;
  let windowLate = 0;
  let roughWindows = 0;
  let severe = false;
  let lateAtPace = 0;
  let fastRetryIn = 0;
  let fastRetryWait = FAST_PACE_RETRY_SECONDS;

  const settle = () => {
    sinceStep = 0;
    lateFrames = 0;
    calm = 0;
    windowSeconds = 0;
    windowFrames = 0;
    windowLate = 0;
    roughWindows = 0;
    severe = false;
  };

  const watchWindow = (seconds: number, late: boolean) => {
    windowSeconds += seconds;
    windowFrames += 1;
    windowLate += late ? 1 : 0;
    if (windowSeconds < BURST_WINDOW_SECONDS) {
      return;
    }
    const share = windowLate / windowFrames;
    roughWindows = share >= ROUGH_SHARE ? roughWindows + 1 : 0;
    severe = share >= SEVERE_SHARE;
    windowSeconds = 0;
    windowFrames = 0;
    windowLate = 0;
  };

  const lower = (reason: GovernReason, by: number): Verdict | null =>
    rung < rungs - 1
      ? { pace, reason, rung: Math.min(rungs - 1, rung + by) }
      : null;

  const raiseWait = (into: number): number => {
    const failed = failures[into] ?? 0;
    if (failed === 0) {
      return RAISE_AFTER_CALM_SECONDS;
    }
    return failed <= RETRIES_PER_RUNG
      ? RETRY_AFTER_CALM_SECONDS
      : Number.POSITIVE_INFINITY;
  };

  const judgeQuality = (seconds: number, busyMs: number): Verdict | null => {
    const late = seconds > LATE_FRAME_FACTOR / BASE_RATE;
    if (late) {
      lateFrames += 1;
      calm = 0;
    } else {
      lateFrames = Math.max(0, lateFrames - CALM_FRAME_CREDIT);
      calm += seconds;
    }
    watchWindow(seconds, late && busyMs < GPU_BOUND_BUSY_MS);
    const bursting = severe || roughWindows >= ROUGH_WINDOWS_TO_STEP;
    if (bursting && sinceStep > BURST_COOLDOWN_SECONDS) {
      return lower("late-burst", severe ? SEVERE_STEP : 1);
    }
    if (lateFrames > LATE_FRAMES_TO_STEP && sinceStep > STEP_COOLDOWN_SECONDS) {
      return lower("late-budget", 1);
    }
    if (rung > 0 && calm > raiseWait(rung - 1)) {
      const retry = (failures[rung - 1] ?? 0) > 0;
      return {
        pace,
        reason: retry ? "calm-retry" : "calm-recovery",
        rung: rung - 1,
      };
    }
    return null;
  };

  const judgePace = (seconds: number, refresh: number): Verdict | null => {
    if (pace > BASE_RATE) {
      const late = seconds > LATE_FRAME_FACTOR / pace;
      lateAtPace = late
        ? lateAtPace + 1
        : Math.max(0, lateAtPace - CALM_FRAME_CREDIT);
      return lateAtPace > LATE_FRAMES_TO_STEP
        ? { pace: BASE_RATE, reason: "pace-fallback", rung }
        : null;
    }
    fastRetryIn -= seconds;
    return refresh > BASE_RATE &&
      rung === 0 &&
      fastRetryIn <= 0 &&
      calm > FAST_PACE_AFTER_CALM_SECONDS
      ? { pace: refresh, reason: "pace-retry", rung }
      : null;
  };

  return {
    calmSeconds: () => calm,
    commit(verdict) {
      for (let failed = rung; failed < verdict.rung; failed += 1) {
        failures[failed] = Math.min(255, (failures[failed] ?? 0) + 1);
      }
      if (verdict.rung !== rung) {
        ({ rung } = verdict);
        settle();
      }
      if (verdict.pace < pace) {
        fastRetryIn = fastRetryWait;
        fastRetryWait = Math.min(LONGEST_WAIT_SECONDS, fastRetryWait * 2);
      }
      if (verdict.pace !== pace) {
        ({ pace } = verdict);
        lateAtPace = 0;
      }
    },
    judge(seconds, busyMs, refresh) {
      sinceStep += seconds;
      return judgeQuality(seconds, busyMs) ?? judgePace(seconds, refresh);
    },
    lateCredit: () => Math.max(lateFrames, lateAtPace),
    get pace() {
      return pace;
    },
    resize(count) {
      rungs = count;
      rung = Math.min(rung, rungs - 1);
      failures = new Uint8Array(rungs);
      settle();
    },
    get rung() {
      return rung;
    },
    startAt(start) {
      rung = Math.min(Math.max(0, start), rungs - 1);
      failures.fill(1, 0, rung);
      settle();
    },
  };
};
