import type { BarSample } from "./gpu-bar.ts";
import { clockStates, clockText } from "./gpu-clock.ts";
import type { ClockSource, ClockState, WindowClock } from "./gpu-clock.ts";
import { GPU_PAIRS, valueOf } from "./gpu-frames.ts";
import type { GpuSample } from "./gpu-frames.ts";
import { parkText } from "./gpu-rv.ts";
import type { ParkReading } from "./gpu-rv.ts";
import { median } from "./result.ts";
import { scenarios } from "./scenarios.ts";
import type { SideName } from "./sides.ts";

const NOTE = "information only, not judged";
const UNAVAILABLE = "unavailable";
const NO_PAIRS = "no pairs";

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

type RowValue = number | typeof NO_PAIRS | typeof UNAVAILABLE;

interface Window {
  readonly clock: WindowClock | null;
  readonly park: ParkReading;
}

interface Tally {
  fast: number;
  mixed: number;
  slow: number;
  unread: number;
}

const stateKey = (clock: WindowClock | null): keyof Tally =>
  clock === null || clock.kind === "unread" ? "unread" : clock.state;

const tallyOf = (windows: readonly Window[]): Tally => {
  const tally: Tally = { fast: 0, mixed: 0, slow: 0, unread: 0 };
  for (const each of windows) {
    tally[stateKey(each.clock)] += 1;
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
): number | null => {
  const bValue = valueOf(row.metric, [b]);
  const aValue = valueOf(row.metric, [a]);
  switch (row.read) {
    case "difference": {
      return (bValue - aValue) * 100;
    }
    case "ratio": {
      return aValue === 0 ? null : bValue / aValue;
    }
    default: {
      return row satisfies never;
    }
  }
};

const rowValue = (values: readonly (number | null)[]): RowValue => {
  if (values.length === 0) {
    return NO_PAIRS;
  }
  const known = values.filter((value) => value !== null);
  return known.length === values.length ? median(known) : UNAVAILABLE;
};

const inState = (
  sample: GpuSample | undefined,
  state: (typeof pairedStates)[number]
): sample is GpuSample =>
  sample !== undefined &&
  stateKey(sample.clock) === state &&
  sample.park.state === "quiet";

const pairsIn = (
  samples: readonly GpuSample[],
  state: (typeof pairedStates)[number]
) =>
  Array.from({ length: GPU_PAIRS }, (_, pair) => {
    const at = (side: SideName) =>
      samples.find((sample) => sample.pair === pair && sample.side === side);
    const a = at("A");
    const b = at("B");
    return inState(a, state) && inState(b, state) ? [{ a, b }] : [];
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
        value: rowValue(pairs.map(({ a, b }) => pairValue(row, a, b))),
      })),
      state,
    };
  });
  return { paired, scenario, windows };
};

const valueText = ({
  value,
  ...row
}: (typeof stateRows)[number] & { readonly value: RowValue }): string => {
  if (value === NO_PAIRS || value === UNAVAILABLE) {
    return `${row.label} ${value}`;
  }
  return row.read === "difference"
    ? `${row.label} ${value >= 0 ? "+" : ""}${value.toFixed(2)}`
    : `${row.label} ${value.toFixed(3)}`;
};

interface Placed extends Window {
  readonly label: string;
  readonly position: number;
}

const placed = (
  samples: readonly GpuSample[],
  bar: readonly BarSample[]
): Placed[] => [
  ...samples.map((sample, position) => ({
    clock: sample.clock,
    label: `${sample.scenario} ${sample.side}`,
    park: sample.park,
    position,
  })),
  ...bar.map((sample, index) => ({
    clock: sample.clock,
    label: "bar B",
    park: sample.park,
    position: samples.length + index,
  })),
];

const unreadLine = (windows: readonly Placed[]): string => {
  const reasons = new Map<string, number[]>();
  for (const each of windows) {
    if (each.clock?.kind === "unread") {
      reasons.set(each.clock.reason, [
        ...(reasons.get(each.clock.reason) ?? []),
        each.position,
      ]);
    }
  }
  const unread = [...reasons.values()].flat().length;
  const why = [...reasons.entries()]
    .map(
      ([reason, positions]) => `${reason} at positions ${positions.join(" ")}`
    )
    .join("; ");
  return `info clock unread ${unread} of ${windows.length} windows${why === "" ? "" : `: ${why}`} (${NOTE})`;
};

export const parkLines = (
  samples: readonly GpuSample[],
  bar: readonly BarSample[]
): string[] => {
  const unsure = placed(samples, bar).filter(
    (each) => each.park.state !== "quiet"
  );
  return [
    unsure.length === 0
      ? `info park every idle slot was proved quiet before its window (${NOTE})`
      : `info park ${unsure.length} windows ran with the idle slot not proved quiet, left out of the same-state pairs: ${unsure
          .map((each) => `position ${each.position} ${parkText(each.park)}`)
          .join("; ")} (${NOTE})`,
  ];
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
  const windows = placed(samples, bar);
  const order = windows.map(
    (each) =>
      `${each.position} ${each.label} ${stateKey(each.clock)}${each.park.state === "quiet" ? "" : ` idle ${each.park.state}`}`
  );
  const lines = states.flatMap(({ paired, scenario, windows: tallies }) => [
    `info clock ${scenario} windows A ${tallyText(tallies.A)}; B ${tallyText(tallies.B)} (${NOTE})`,
    ...paired.map(
      ({ pairs, rows, state }) =>
        `info clock ${scenario} ${state}-state pairs ${pairs} of ${GPU_PAIRS}: ${rows.map(valueText).join(", ")} (${NOTE})`
    ),
  ]);
  return {
    lines: [
      ...lines,
      `info clock bar side=B ${tallyText(tallyOf(bar))} (${NOTE})`,
      unreadLine(windows),
      `info clock by position after warm-up: ${order.join(", ")} (${NOTE})`,
    ],
    order,
    states,
  };
};

export const windowText = ({ clock, park }: Window): string =>
  [clock === null ? "" : clockText(clock), parkText(park)]
    .filter((part) => part !== "")
    .join(", ");
