import type { BarSample } from "./gpu-bar.ts";
import { clockStates, clockText } from "./gpu-clock.ts";
import type { ClockSource, ClockState, WindowClock } from "./gpu-clock.ts";
import { GPU_PAIRS, valueOf } from "./gpu-frames.ts";
import type { GpuSample } from "./gpu-frames.ts";
import { median } from "./result.ts";
import { scenarios } from "./scenarios.ts";
import type { SideName } from "./sides.ts";

const NOTE = "information only, not judged";

const pairedStates = ["fast", "slow"] as const satisfies readonly ClockState[];

const stateRows = [
  { label: "p50 B/A", metric: "frame.interval.p50", read: "ratio" },
  { label: "p95 B/A", metric: "frame.interval.p95", read: "ratio" },
  { label: "p99 B/A", metric: "frame.interval.p99", read: "ratio" },
  {
    label: "missed B-A pp",
    metric: "frame.missedFraction",
    read: "difference",
  },
  { label: "riders p95 B/A", metric: "riders.cpu.p95", read: "ratio" },
] as const;

interface Tally {
  fast: number;
  mixed: number;
  slow: number;
  unread: number;
}

const tallyOf = (
  samples: readonly { readonly clock: WindowClock | null }[]
): Tally => {
  const tally: Tally = { fast: 0, mixed: 0, slow: 0, unread: 0 };
  for (const sample of samples) {
    tally[sample.clock?.state ?? "unread"] += 1;
  }
  return tally;
};

const tallyText = (tally: Tally): string =>
  [...clockStates, "unread" as const]
    .map((state) => `${state} ${tally[state]}`)
    .join(" ");

const pairValue = (
  row: (typeof stateRows)[number],
  a: GpuSample,
  b: GpuSample
): number => {
  const bValue = valueOf(row.metric, [b]);
  const aValue = valueOf(row.metric, [a]);
  switch (row.read) {
    case "difference": {
      return (bValue - aValue) * 100;
    }
    case "ratio": {
      return bValue / aValue;
    }
    default: {
      return row satisfies never;
    }
  }
};

const pairsIn = (
  samples: readonly GpuSample[],
  state: (typeof pairedStates)[number]
) =>
  Array.from({ length: GPU_PAIRS }, (_, pair) => {
    const at = (side: SideName) =>
      samples.find((sample) => sample.pair === pair && sample.side === side);
    const a = at("A");
    const b = at("B");
    return a?.clock?.state === state && b?.clock?.state === state
      ? [{ a, b }]
      : [];
  }).flat();

const stateOfScenario = (scenario: string, samples: readonly GpuSample[]) => {
  const mine = samples.filter((sample) => sample.scenario === scenario);
  const windows = {
    A: tallyOf(mine.filter((sample) => sample.side === "A")),
    B: tallyOf(mine.filter((sample) => sample.side === "B")),
  };
  const paired = pairedStates.map((state) => {
    const pairs = pairsIn(mine, state);
    return {
      pairs: pairs.length,
      rows: stateRows.map((row) => ({
        ...row,
        value:
          pairs.length === 0
            ? null
            : median(pairs.map(({ a, b }) => pairValue(row, a, b))),
      })),
      state,
    };
  });
  return { paired, scenario, windows };
};

const valueText = ({
  value,
  ...row
}: (typeof stateRows)[number] & { readonly value: number | null }): string => {
  if (value === null) {
    return `${row.label} none`;
  }
  return row.read === "difference"
    ? `${row.label} ${value >= 0 ? "+" : ""}${value.toFixed(2)}`
    : `${row.label} ${value.toFixed(3)}`;
};

export const clockStatesOf = (
  source: ClockSource,
  samples: readonly GpuSample[],
  bar: readonly BarSample[]
) => {
  if (source.kind === "absent") {
    return { lines: [], order: [], states: [] };
  }
  const states = scenarios.map((scenario) =>
    stateOfScenario(scenario.id, samples)
  );
  const order = [
    ...samples.map(
      (sample, index) =>
        `${index} ${sample.scenario} ${sample.side} ${sample.clock?.state ?? "unread"}`
    ),
    ...bar.map(
      (sample, index) =>
        `${samples.length + index} bar B ${sample.clock?.state ?? "unread"}`
    ),
  ];
  const lines = states.flatMap(({ paired, scenario, windows }) => [
    `info clock ${scenario} windows A ${tallyText(windows.A)}; B ${tallyText(windows.B)} (${NOTE})`,
    ...paired.map(
      ({ pairs, rows, state }) =>
        `info clock ${scenario} ${state}-state pairs ${pairs} of ${GPU_PAIRS}: ${rows.map(valueText).join(", ")} (${NOTE})`
    ),
  ]);
  return {
    lines: [
      ...lines,
      `info clock bar side=B ${tallyText(tallyOf(bar))} (${NOTE})`,
      `info clock by position after warm-up: ${order.join(", ")} (${NOTE})`,
    ],
    order,
    states,
  };
};

export const windowClockLine = ({
  clock,
  parkTries,
}: Pick<GpuSample, "clock" | "parkTries">): string =>
  `${clockText(clock)}${parkTries > 1 ? `, idle slot settled after ${parkTries} park checks` : ""}`;
