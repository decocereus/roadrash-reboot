const STALE_PRESS_MS = 500;

export interface LatencySummary {
  readonly medianMs: number;
  readonly samples: number;
  readonly worstMs: number;
}

export interface InputLatency {
  readonly controlApplied: () => void;
  readonly controlChanged: () => void;
  readonly pressed: () => void;
  readonly summary: () => LatencySummary;
}

export const createInputLatency = (
  now: () => number,
  afterFrame: (done: () => void) => void
): InputLatency => {
  const samples: number[] = [];
  let pressedAt: number | null = null;
  let sampledFrom: number | null = null;
  return {
    controlApplied: () => {
      if (sampledFrom === null) {
        return;
      }
      const from = sampledFrom;
      sampledFrom = null;
      afterFrame(() => {
        samples.push(now() - from);
      });
    },
    controlChanged: () => {
      if (pressedAt === null) {
        return;
      }
      const from = pressedAt;
      pressedAt = null;
      if (now() - from <= STALE_PRESS_MS) {
        sampledFrom = from;
      }
    },
    pressed: () => {
      pressedAt ??= now();
    },
    summary: () => {
      const sorted = samples.toSorted((left, right) => left - right);
      return {
        medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
        samples: sorted.length,
        worstMs: sorted.at(-1) ?? 0,
      };
    },
  };
};
