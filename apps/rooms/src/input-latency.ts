const STALE_PRESS_MS = 500;

export interface LatencySummary {
  readonly medianMs: number;
  readonly samples: number;
  readonly worstMs: number;
}

export interface InputLatency {
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
  return {
    controlChanged: () => {
      if (pressedAt === null) {
        return;
      }
      const from = pressedAt;
      pressedAt = null;
      if (now() - from > STALE_PRESS_MS) {
        return;
      }
      afterFrame(() => {
        samples.push(now() - from);
      });
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
