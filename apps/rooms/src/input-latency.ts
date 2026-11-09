const STALE_PRESS_MS = 500;

export interface LatencySummary {
  readonly medianMs: number;
  readonly samples: number;
  readonly worstMs: number;
}

export interface InputLatency {
  readonly controlChanged: (appliesAt: number) => void;
  readonly pressed: () => void;
  readonly reached: (tick: number) => void;
  readonly summary: () => LatencySummary;
}

export const createInputLatency = (
  now: () => number,
  afterFrame: (done: () => void) => void
): InputLatency => {
  const samples: number[] = [];
  let pressedAt: number | null = null;
  let sampledFrom: number | null = null;
  let sampledTick = 0;
  return {
    controlChanged: (appliesAt) => {
      if (pressedAt === null) {
        return;
      }
      const from = pressedAt;
      pressedAt = null;
      if (sampledFrom === null && now() - from <= STALE_PRESS_MS) {
        sampledFrom = from;
        sampledTick = appliesAt;
      }
    },
    pressed: () => {
      pressedAt ??= now();
    },
    reached: (tick) => {
      if (sampledFrom === null || tick < sampledTick) {
        return;
      }
      const from = sampledFrom;
      sampledFrom = null;
      afterFrame(() => {
        samples.push(now() - from);
      });
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
