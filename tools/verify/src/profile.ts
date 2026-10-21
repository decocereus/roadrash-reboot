import {
  summariseTrace,
  threadNames,
  traceEvent,
} from "@racer/devtools/analysis";
import type { TraceEvent, TraceSummary } from "@racer/devtools/analysis";
import { evaluate } from "@racer/devtools/cdp";
import type { Session } from "@racer/devtools/cdp";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { VerificationError } from "./verification-error.ts";

const TOP_THREADS = 10;

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "toplevel",
  "blink.user_timing",
  "v8.execute",
  "gpu",
  "disabled-by-default-gpu.service",
  "viz",
] as const;

const collectedChunk = Schema.Struct({ value: Schema.Array(Schema.Unknown) });

interface ThreadLoad {
  readonly thread: string;
  readonly busyMs: number;
}

interface TraceResult {
  readonly file: string;
  readonly events: number;
  readonly summary: TraceSummary;
  readonly threads: readonly ThreadLoad[];
}

const busiestThreads = (events: readonly TraceEvent[]): ThreadLoad[] => {
  const names = threadNames(events);
  const covered = new Map<string, { until: number; busy: number }>();
  const complete = events
    .filter((event) => event.ph === "X")
    .toSorted((a, b) => a.ts - b.ts);
  for (const event of complete) {
    const key = `${event.pid}:${event.tid}`;
    const seen = covered.get(key) ?? {
      busy: 0,
      until: Number.NEGATIVE_INFINITY,
    };
    const end = event.ts + (event.dur ?? 0);
    if (event.ts >= seen.until) {
      covered.set(key, { busy: seen.busy + (event.dur ?? 0), until: end });
    }
  }
  return [...covered.entries()]
    .map(([key, load]) => ({
      busyMs: load.busy / 1000,
      thread: names.get(key) ?? key,
    }))
    .toSorted((a, b) => b.busyMs - a.busyMs)
    .slice(0, TOP_THREADS);
};

const decodeEvent = Schema.decodeUnknownOption(traceEvent);

export const trace = Effect.fn("rv.trace")(function* trace(
  page: Session,
  file: string,
  seconds: number
) {
  const fs = yield* FileSystem.FileSystem;
  const raw: unknown[] = [];
  yield* page.on("Tracing.dataCollected", collectedChunk, ({ value }) => {
    raw.push(...value);
  });
  const complete = yield* page.once("Tracing.tracingComplete", Schema.Unknown);
  yield* page.send("Tracing.start", {
    traceConfig: { includedCategories: [...TRACE_CATEGORIES] },
    transferMode: "ReportEvents",
  });
  yield* Effect.sleep(seconds * 1000);
  yield* page.send("Tracing.end");
  yield* complete;
  yield* fs.writeFileString(file, JSON.stringify({ traceEvents: raw }));
  const events = raw.flatMap((each) => Option.toArray(decodeEvent(each)));
  const result: TraceResult = {
    events: raw.length,
    file,
    summary: summariseTrace(events),
    threads: busiestThreads(events),
  };
  return result;
});

const profileInfo = Schema.Struct({
  gpuTimer: Schema.Boolean,
  parts: Schema.Array(Schema.String),
  renderer: Schema.String,
  tick: Schema.Number,
});

const frameSample = Schema.Struct({
  calls: Schema.Array(Schema.Number),
  cpu: Schema.Array(Schema.Number),
  interval: Schema.Number,
  pixelRatio: Schema.Number,
  rung: Schema.Number,
  tick: Schema.Number,
});

interface Stats {
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

const statsOf = (values: readonly number[]): Stats => {
  const sorted = values.toSorted((a, b) => a - b);
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
  return {
    max: sorted.at(-1) ?? 0,
    mean:
      sorted.length > 0
        ? sorted.reduce((sum, each) => sum + each, 0) / sorted.length
        : 0,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
  };
};

const LATE_MS = [20, 33] as const;

interface Sample {
  readonly renderer: string;
  readonly fromTick: number;
  readonly toTick: number;
  readonly frames: number;
  readonly fps: number;
  readonly interval: Stats;
  readonly jsFrame: Stats;
  readonly calls: number;
  readonly late: Readonly<Record<string, number>>;
  readonly pixelRatios: readonly number[];
  readonly rungs: readonly number[];
}

export const sample = Effect.fn("rv.sample")(function* sample(
  page: Session,
  seconds: number
) {
  const read =
    "globalThis.__rushlineProfile ? globalThis.__rushlineProfile.info() : null";
  const before = yield* evaluate(page, read, Schema.NullOr(profileInfo));
  if (!before) {
    return yield* new VerificationError({
      message:
        "The page has no frame recorder. Open it with &prof (or ?stress) and sample again.",
      operation: "sample",
    });
  }
  yield* Effect.sleep(seconds * 1000);
  const after = yield* evaluate(page, read, profileInfo);
  const frames = yield* evaluate(
    page,
    `globalThis.__rushlineProfile.window(${before.tick + 1}, ${after.tick})`,
    Schema.Array(frameSample)
  );
  const interval = statsOf(frames.map((frame) => frame.interval));
  const sampled: Sample = {
    calls: statsOf(
      frames.map((frame) => frame.calls.reduce((sum, each) => sum + each, 0))
    ).mean,
    fps: interval.mean > 0 ? 1000 / interval.mean : 0,
    frames: frames.length,
    fromTick: before.tick + 1,
    interval,
    jsFrame: statsOf(
      frames.map((frame) => frame.cpu.reduce((sum, each) => sum + each, 0))
    ),
    late: Object.fromEntries(
      LATE_MS.map((limit) => [
        `over${limit}ms`,
        frames.filter((frame) => frame.interval > limit).length,
      ])
    ),
    pixelRatios: [...new Set(frames.map((frame) => frame.pixelRatio))],
    renderer: after.renderer,
    rungs: [...new Set(frames.map((frame) => frame.rung))],
    toTick: after.tick,
  };
  return sampled;
});

export interface NetworkProfile {
  readonly latency: number;
  readonly downloadThroughput: number;
  readonly uploadThroughput: number;
}

const MEGABIT = 125_000;

export const networkProfiles = new Map<string, NetworkProfile>([
  [
    "3g",
    {
      downloadThroughput: 1.6 * MEGABIT,
      latency: 300,
      uploadThroughput: 0.75 * MEGABIT,
    },
  ],
  [
    "fast4g",
    {
      downloadThroughput: 9 * MEGABIT,
      latency: 60,
      uploadThroughput: 1.5 * MEGABIT,
    },
  ],
  [
    "slow4g",
    {
      downloadThroughput: 3 * MEGABIT,
      latency: 150,
      uploadThroughput: 1.5 * MEGABIT,
    },
  ],
]);

export const throttle = Effect.fn("rv.throttle")(function* throttle(
  page: Session,
  cpu: number,
  network: string
) {
  yield* page.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const profile = networkProfiles.get(network);
  if (!profile) {
    return;
  }
  yield* page.send("Network.enable");
  yield* page.send("Network.emulateNetworkConditions", {
    downloadThroughput: profile.downloadThroughput,
    latency: profile.latency,
    offline: false,
    uploadThroughput: profile.uploadThroughput,
  });
});
