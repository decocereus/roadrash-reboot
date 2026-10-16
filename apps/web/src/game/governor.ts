import type { FrameRate, GovernReason } from "@racer/telemetry/limits";

import { deliveredRate, LOWEST_REFRESH, vsyncsPerFrame } from "./pacer.ts";

export const BASE_RATE = 60;
export const HALF_RATE = 30;
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
const RATE_WINDOW_SECONDS = 2;
const DELIVERED_SHARE = 0.97;
const SHORT_WINDOWS_TO_STEP = 2;
const RAISE_AFTER_CALM_SECONDS = 20;
const RETRY_AFTER_CALM_SECONDS = 300;
const RETRIES_PER_RUNG = 1;
const FAST_PACE_AFTER_CALM_SECONDS = 10;
const FAST_PACE_RETRY_SECONDS = 60;
const LONGEST_WAIT_SECONDS = 300;

export interface Verdict {
  readonly reason: GovernReason;
  readonly step: number;
  readonly pace: number;
}

export interface Frame {
  readonly seconds: number;
  readonly busyMs: number;
  readonly refresh: number;
  readonly refreshKnown: boolean;
  readonly vsyncs: number;
  readonly excused: boolean;
}

export interface Governor {
  readonly rung: number;
  readonly pace: number;
  readonly rate: FrameRate;
  readonly lateCredit: () => number;
  readonly calmSeconds: () => number;
  readonly judge: (frame: Frame) => Verdict | null;
  readonly commit: (verdict: Verdict) => void;
  readonly startAt: (rung: number) => void;
  readonly resize: (rungs: number) => void;
  readonly setRate: (rate: FrameRate) => void;
  readonly interrupt: () => void;
}

export const createGovernor = (rungCount: number): Governor => {
  let rungs = rungCount;
  let step = 0;
  let pace = BASE_RATE;
  let rate: FrameRate = "auto";
  let failures = new Uint8Array(rungs);
  let lockFailures = 0;
  let lateFrames = 0;
  let calm = 0;
  let sinceStep = STEP_COOLDOWN_SECONDS;
  let windowSeconds = 0;
  let windowFrames = 0;
  let windowLate = 0;
  let roughWindows = 0;
  let severe = false;
  let rateSeconds = 0;
  let rateFrames = 0;
  let rateVsyncs = 0;
  let rateBusyMs = 0;
  let shortWindows = 0;
  let lateAtPace = 0;
  let fastRetryIn = 0;
  let fastRetryWait = FAST_PACE_RETRY_SECONDS;

  const halved = (): boolean => rate === "30" || step === rungs;

  const currentPace = (): number => {
    if (halved()) {
      return HALF_RATE;
    }
    return rate === "60" ? BASE_RATE : pace;
  };

  const lowestStep = (): number => (rate === "auto" ? rungs : rungs - 1);

  const forgetWindows = () => {
    windowSeconds = 0;
    windowFrames = 0;
    windowLate = 0;
    roughWindows = 0;
    severe = false;
    rateSeconds = 0;
    rateFrames = 0;
    rateVsyncs = 0;
    rateBusyMs = 0;
    shortWindows = 0;
  };

  const settle = () => {
    sinceStep = 0;
    lateFrames = 0;
    calm = 0;
    forgetWindows();
  };

  const watchBursts = (seconds: number, late: boolean) => {
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

  const expectedFrames = (refresh: number): number => {
    const seen = Math.max(rateVsyncs, rateSeconds * LOWEST_REFRESH);
    return Math.min(
      seen / vsyncsPerFrame(refresh, currentPace()),
      rateSeconds * BASE_RATE
    );
  };

  const watchRate = ({
    seconds,
    busyMs,
    refresh,
    refreshKnown,
    vsyncs,
  }: Frame) => {
    if (!refreshKnown) {
      return;
    }
    rateSeconds += seconds;
    rateFrames += 1;
    rateVsyncs += vsyncs;
    rateBusyMs += busyMs;
    if (rateSeconds < RATE_WINDOW_SECONDS) {
      return;
    }
    const short = rateFrames < expectedFrames(refresh) * DELIVERED_SHARE;
    if (short) {
      calm = 0;
    }
    const gpuBound = rateBusyMs / rateFrames < GPU_BOUND_BUSY_MS;
    shortWindows = short && gpuBound ? shortWindows + 1 : 0;
    rateSeconds = 0;
    rateFrames = 0;
    rateVsyncs = 0;
    rateBusyMs = 0;
  };

  const lower = (reason: GovernReason, by: number): Verdict | null => {
    const lowest = lowestStep();
    if (step >= lowest) {
      return null;
    }
    if (step >= rungs - 1) {
      return { pace, reason: "steady-30", step: lowest };
    }
    return { pace, reason, step: Math.min(rungs - 1, step + by) };
  };

  const failuresInto = (into: number): number =>
    step === rungs ? lockFailures : (failures[into] ?? 0);

  const raiseWait = (into: number): number => {
    const failed = failuresInto(into);
    if (failed === 0) {
      return RAISE_AFTER_CALM_SECONDS;
    }
    return failed <= RETRIES_PER_RUNG
      ? RETRY_AFTER_CALM_SECONDS
      : Number.POSITIVE_INFINITY;
  };

  const judgeQuality = (frame: Frame): Verdict | null => {
    const { seconds, busyMs, refresh } = frame;
    const target = Math.min(deliveredRate(refresh, currentPace()), BASE_RATE);
    const late = seconds > LATE_FRAME_FACTOR / target;
    if (late) {
      lateFrames += 1;
      calm = 0;
    } else {
      lateFrames = Math.max(0, lateFrames - CALM_FRAME_CREDIT);
      calm += seconds;
    }
    watchBursts(seconds, late && busyMs < GPU_BOUND_BUSY_MS);
    watchRate(frame);
    const bursting = severe || roughWindows >= ROUGH_WINDOWS_TO_STEP;
    if (bursting && sinceStep > BURST_COOLDOWN_SECONDS) {
      return lower("late-burst", severe ? SEVERE_STEP : 1);
    }
    if (shortWindows >= SHORT_WINDOWS_TO_STEP) {
      return lower("under-rate", 1);
    }
    if (lateFrames > LATE_FRAMES_TO_STEP && sinceStep > STEP_COOLDOWN_SECONDS) {
      return lower("late-budget", 1);
    }
    if (step > 0 && calm > raiseWait(step - 1)) {
      const retry = failuresInto(step - 1) > 0;
      return {
        pace,
        reason: retry ? "calm-retry" : "calm-recovery",
        step: step - 1,
      };
    }
    return null;
  };

  const judgePace = (seconds: number, refresh: number): Verdict | null => {
    if (rate !== "auto" || halved()) {
      return null;
    }
    if (pace > BASE_RATE) {
      const late = seconds > LATE_FRAME_FACTOR / pace;
      lateAtPace = late
        ? lateAtPace + 1
        : Math.max(0, lateAtPace - CALM_FRAME_CREDIT);
      return lateAtPace > LATE_FRAMES_TO_STEP
        ? { pace: BASE_RATE, reason: "pace-fallback", step }
        : null;
    }
    fastRetryIn -= seconds;
    return refresh > BASE_RATE &&
      step === 0 &&
      fastRetryIn <= 0 &&
      calm > FAST_PACE_AFTER_CALM_SECONDS
      ? { pace: refresh, reason: "pace-retry", step }
      : null;
  };

  return {
    calmSeconds: () => calm,
    commit(verdict) {
      if (verdict.step === rungs && step < rungs) {
        lockFailures += 1;
      }
      for (
        let failed = step;
        failed < Math.min(verdict.step, rungs);
        failed += 1
      ) {
        failures[failed] = Math.min(255, (failures[failed] ?? 0) + 1);
      }
      if (verdict.step !== step) {
        ({ step } = verdict);
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
    interrupt: forgetWindows,
    judge(frame) {
      sinceStep += frame.seconds;
      if (frame.excused) {
        return null;
      }
      return judgeQuality(frame) ?? judgePace(frame.seconds, frame.refresh);
    },
    lateCredit: () => Math.max(lateFrames, lateAtPace),
    get pace() {
      return currentPace();
    },
    get rate() {
      return rate;
    },
    resize(count) {
      const locked = step === rungs;
      if (failures.length < count) {
        const grown = new Uint8Array(count);
        grown.set(failures);
        failures = grown;
      }
      rungs = count;
      step = locked ? rungs : Math.min(step, rungs - 1);
      settle();
    },
    get rung() {
      return Math.min(step, rungs - 1);
    },
    setRate(next) {
      rate = next;
      step = Math.min(step, lowestStep());
      if (rate !== "auto") {
        pace = BASE_RATE;
      }
      settle();
    },
    startAt(start) {
      step = Math.min(Math.max(0, start), rungs - 1);
      failures.fill(1, 0, step);
      settle();
    },
  };
};
