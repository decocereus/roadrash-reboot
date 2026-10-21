import { eventsDuring, threadNames } from "@racer/devtools/analysis";
import type {
  StallEvent,
  TraceEvent,
  TraceSummary,
} from "@racer/devtools/analysis";
import type { Allocations, Hotspots } from "@racer/devtools/profiles";
import * as Schema from "effect/Schema";

const STALL_EVENTS = 8;

const PART_SHOWN_MS = 0.3;

export const LATE_MS = [20, 33] as const;

export const frameSample = Schema.Struct({
  calls: Schema.Array(Schema.Number),
  cpu: Schema.Array(Schema.Number),
  frame: Schema.Number,
  geometries: Schema.optionalKey(Schema.Number),
  gpu: Schema.NullOr(Schema.Array(Schema.Number)),
  interval: Schema.Number,
  pixelRatio: Schema.Number,
  programs: Schema.optionalKey(Schema.Number),
  rung: Schema.Number,
  start: Schema.optionalKey(Schema.Number),
  textures: Schema.optionalKey(Schema.Number),
  tick: Schema.Number,
  ticks: Schema.Number,
  triangles: Schema.Array(Schema.Number),
});

type Frame = typeof frameSample.Type;

export const profileInfo = Schema.Struct({
  frames: Schema.Number,
  gpuTimer: Schema.Boolean,
  parts: Schema.Array(Schema.String),
  renderer: Schema.String,
  tick: Schema.Number,
});

export const pageSize = Schema.Struct({
  height: Schema.Number,
  ratio: Schema.Number,
  width: Schema.Number,
});

export const heapUsage = Schema.Struct({
  totalSize: Schema.Number,
  usedSize: Schema.Number,
});

interface Stats {
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export interface PartSummary {
  readonly part: string;
  readonly cpu: Stats;
  readonly gpu: Stats | null;
  readonly calls: number;
  readonly triangles: number;
}

interface Stall {
  readonly tick: number;
  readonly interval: number;
  readonly calls: number;
  readonly parts: readonly (readonly [string, number])[];
  readonly events: readonly StallEvent[];
}

interface Growth {
  readonly resource: "programs" | "textures" | "geometries";
  readonly first: number;
  readonly last: number;
  readonly grownAt: readonly number[];
}

const resources = ["programs", "textures", "geometries"] as const;

export const growthOf = (frames: readonly Frame[]): Growth[] =>
  resources.map((resource) => {
    const counts = frames.map((frame) => frame[resource] ?? 0);
    return {
      first: counts[0] ?? 0,
      grownAt: frames
        .filter(
          (frame, index) =>
            index > 0 && (frame[resource] ?? 0) > (counts[index - 1] ?? 0)
        )
        .map((frame) => frame.tick),
      last: counts.at(-1) ?? 0,
      resource,
    };
  });

export interface RunResult {
  readonly run: number;
  readonly renderer: string;
  readonly gpuTimer: boolean;
  readonly page: typeof pageSize.Type;
  readonly frames: number;
  readonly interval: Stats;
  readonly fps: number;
  readonly jsFrame: Stats;
  readonly calls: Stats;
  readonly triangles: Stats;
  readonly parts: readonly PartSummary[];
  readonly pixelRatios: readonly number[];
  readonly rungs: readonly number[];
  readonly heapBefore: typeof heapUsage.Type;
  readonly heapAfter: typeof heapUsage.Type;
  readonly trace: TraceSummary | null;
  readonly load: number;
  readonly gcEventNames: readonly string[];
  readonly hot: Hotspots | null;
  readonly allocations: Allocations | null;
  readonly shots: readonly string[];
  readonly late: readonly number[];
  readonly growth: readonly Growth[];
  readonly stalls: readonly Stall[];
  readonly samples: readonly Frame[];
}

const percentile = (sorted: readonly number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;

const statsOf = (values: readonly number[]): Stats => {
  const sorted = values.toSorted((a, b) => a - b);
  const total = sorted.reduce((sum, each) => sum + each, 0);
  return {
    max: sorted.at(-1) ?? 0,
    mean: sorted.length > 0 ? total / sorted.length : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
};

export const mean = (values: readonly number[]): number =>
  values.length > 0
    ? values.reduce((sum, each) => sum + each, 0) / values.length
    : 0;

const sum = (values: readonly number[]): number =>
  values.reduce((total, each) => total + each, 0);

export const afterGreenLight = (
  frames: readonly Frame[],
  from: number
): Frame[] => {
  const lastHeld = frames.findLastIndex((frame) => frame.tick === 0);
  return frames.slice(lastHeld + 1).filter((frame) => frame.tick >= from);
};

export const summarise = (
  frames: readonly Frame[],
  partNames: readonly string[]
): Pick<
  RunResult,
  "interval" | "fps" | "jsFrame" | "calls" | "triangles" | "parts"
> => {
  const interval = statsOf(frames.map((frame) => frame.interval));
  const withGpu = frames.filter((frame) => frame.gpu !== null);
  return {
    calls: statsOf(frames.map((frame) => sum(frame.calls))),
    fps: interval.mean > 0 ? 1000 / interval.mean : 0,
    interval,
    jsFrame: statsOf(frames.map((frame) => sum(frame.cpu))),
    parts: partNames.map((part, index) => ({
      calls: mean(frames.map((frame) => frame.calls[index] ?? 0)),
      cpu: statsOf(frames.map((frame) => frame.cpu[index] ?? 0)),
      gpu:
        withGpu.length > 0
          ? statsOf(withGpu.map((frame) => frame.gpu?.[index] ?? 0))
          : null,
      part,
      triangles: mean(frames.map((frame) => frame.triangles[index] ?? 0)),
    })),
    triangles: statsOf(frames.map((frame) => sum(frame.triangles))),
  };
};

export const stallsOf = (
  frames: readonly Frame[],
  partNames: readonly string[],
  events: readonly TraceEvent[],
  offsetMicros: number | null,
  count: number
): Stall[] => {
  const threads = threadNames(events);
  const byNumber = new Map(frames.map((frame) => [frame.frame, frame]));
  return frames
    .toSorted((a, b) => b.interval - a.interval)
    .slice(0, count)
    .map((late) => {
      const cause = byNumber.get(late.frame - 1) ?? late;
      const end = late.start ?? 0;
      return {
        calls: sum(cause.calls),
        events:
          offsetMicros === null || late.start === undefined
            ? []
            : eventsDuring(
                events,
                threads,
                [
                  offsetMicros + (end - late.interval) * 1000,
                  offsetMicros + end * 1000,
                ],
                STALL_EVENTS
              ),
        interval: late.interval,
        parts: partNames
          .map((part, index): readonly [string, number] => [
            part,
            cause.cpu[index] ?? 0,
          ])
          .filter(([, cpu]) => cpu >= PART_SHOWN_MS),
        tick: cause.tick,
      };
    });
};
