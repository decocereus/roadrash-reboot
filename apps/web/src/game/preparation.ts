import type { Compiling } from "./post.ts";

const COMPILE_TIMEOUT_MS = 5000;

export type PrepareOutcome =
  | { readonly kind: "ready" }
  | { readonly kind: "timedOut" }
  | {
      readonly kind: "failed";
      readonly stage: "build" | "compile" | "warm";
      readonly cause: Error;
    }
  | { readonly kind: "lost" }
  | { readonly kind: "cancelled" };

export interface Clock {
  readonly after: (ms: number, run: () => void) => () => void;
}

export const nativeClock: Clock = {
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => {
      clearTimeout(timer);
    };
  },
};

interface PreparationParts {
  readonly clock: Clock;
  readonly compile: () => Compiling;
  readonly warm: () => void;
}

export interface Preparation {
  readonly prepare: () => Promise<PrepareOutcome>;
  readonly warmNow: () => void;
  readonly cancel: () => void;
  readonly lose: () => void;
  readonly restore: () => void;
}

interface Job {
  readonly settle: (outcome: PrepareOutcome) => void;
  compiling: Compiling | null;
  stopDeadline: (() => void) | null;
}

const ready: PrepareOutcome = { kind: "ready" };
const timedOut: PrepareOutcome = { kind: "timedOut" };
const lost: PrepareOutcome = { kind: "lost" };
const cancelled: PrepareOutcome = { kind: "cancelled" };

const errorOf = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export const createPreparation = ({
  clock,
  compile,
  warm,
}: PreparationParts): Preparation => {
  let job: Job | null = null;
  let contextLost = false;

  const release = (current: Job): boolean => {
    if (job !== current) {
      return false;
    }
    job = null;
    current.stopDeadline?.();
    current.compiling?.stop?.();
    return true;
  };

  const warmed = (outcome: PrepareOutcome): PrepareOutcome => {
    try {
      warm();
      return outcome;
    } catch (error) {
      return outcome.kind === "failed"
        ? outcome
        : { cause: errorOf(error), kind: "failed", stage: "warm" };
    }
  };

  const finish = (current: Job, outcome: PrepareOutcome): void => {
    if (release(current)) {
      current.settle(warmed(outcome));
    }
  };

  const end = (outcome: PrepareOutcome): void => {
    const current = job;
    if (current && release(current)) {
      current.settle(outcome);
    }
  };

  const finishWhenReady = async (current: Job, compiling: Compiling) => {
    await compiling.ready;
    finish(current, ready);
  };

  const prepare = async (): Promise<PrepareOutcome> => {
    end(cancelled);
    if (contextLost) {
      return lost;
    }
    const { promise, resolve } = Promise.withResolvers<PrepareOutcome>();
    const current: Job = {
      compiling: null,
      settle: resolve,
      stopDeadline: null,
    };
    job = current;
    try {
      current.compiling = compile();
    } catch (error) {
      finish(current, {
        cause: errorOf(error),
        kind: "failed",
        stage: "compile",
      });
      return await promise;
    }
    current.stopDeadline = clock.after(COMPILE_TIMEOUT_MS, () => {
      finish(current, timedOut);
    });
    void finishWhenReady(current, current.compiling);
    return await promise;
  };

  return {
    cancel: () => {
      end(cancelled);
    },
    lose: () => {
      contextLost = true;
      end(lost);
    },
    prepare,
    restore: () => {
      contextLost = false;
    },
    warmNow: () => {
      end(cancelled);
      if (!contextLost) {
        warm();
      }
    },
  };
};
