import * as Schema from "effect/Schema";

import type { Observation } from "./budgets.ts";
import {
  frameReaders,
  gpuFrame,
  intervalsOf,
  missedFractionOf,
  peakOf,
  total,
} from "./gpu-frame-reads.ts";
import { quantile } from "./result.ts";

export const BAR_BENCH = {
  camera: "room",
  cameraKey: "rushline.bar-camera",
  from: 300,
  path: "/bar?prof&time=dusk",
  samples: 5,
  to: 1500,
} as const;

export const barCapture = Schema.Struct({
  camera: Schema.NullOr(Schema.String),
  frames: Schema.Array(gpuFrame),
  viewport: Schema.Struct({
    dpr: Schema.Number,
    height: Schema.Number,
    width: Schema.Number,
  }),
  visibility: Schema.String,
});

export interface BarSample {
  readonly capture: typeof barCapture.Type;
  readonly consoleErrors: number;
  readonly file: string;
}

const intervalAt = (share: number) => (sample: BarSample) =>
  quantile(intervalsOf([sample]), share);

export const barMetrics = [
  { metric: "bar.frame.interval.p50", read: intervalAt(0.5), unit: "ms" },
  { metric: "bar.frame.interval.p95", read: intervalAt(0.95), unit: "ms" },
  { metric: "bar.frame.interval.p99", read: intervalAt(0.99), unit: "ms" },
  {
    metric: "bar.frame.missedFraction",
    read: (sample: BarSample) => missedFractionOf([sample]),
    unit: "share",
  },
  {
    metric: "bar.render.calls.max",
    read: (sample: BarSample) =>
      peakOf([sample], frameReaders["render.calls.max"]),
    unit: "calls",
  },
  {
    metric: "bar.render.triangles.max",
    read: (sample: BarSample) =>
      peakOf([sample], frameReaders["render.triangles.max"]),
    unit: "triangles",
  },
] as const;

const problemsOf = (
  { capture, consoleErrors }: BarSample,
  page: BarSample["capture"]["viewport"] | null
): string[] => {
  const wanted = BAR_BENCH.to - BAR_BENCH.from;
  const { dpr, height, width } = capture.viewport;
  return [
    ...(capture.camera === BAR_BENCH.camera
      ? []
      : [`camera=${capture.camera ?? "unset"} expected=${BAR_BENCH.camera}`]),
    ...(capture.frames.length >= wanted
      ? []
      : [`frames=${capture.frames.length} expected>=${wanted}`]),
    ...(capture.frames.every((frame) => total(frame.calls) > 0)
      ? []
      : ["a frame drew nothing"]),
    ...(capture.visibility === "visible"
      ? []
      : [`visibility=${capture.visibility} expected=visible`]),
    ...(consoleErrors === 0
      ? []
      : [`console errors=${consoleErrors} expected=0`]),
    ...(page === null ||
    (dpr === page.dpr && height === page.height && width === page.width)
      ? []
      : [
          `page=${width}x${height}@${dpr} expected=${page.width}x${page.height}@${page.dpr}`,
        ]),
  ];
};

export const barResult = (
  samples: readonly BarSample[],
  environment: string,
  page: BarSample["capture"]["viewport"] | null
) => {
  const failures = [
    ...(samples.length === BAR_BENCH.samples
      ? []
      : [`FAIL bar samples=${samples.length} expected=${BAR_BENCH.samples}`]),
    ...samples.flatMap((sample) =>
      problemsOf(sample, page).map(
        (problem) => `FAIL bar ${sample.file} ${problem}`
      )
    ),
  ];
  if (failures.length > 0) {
    return { failures, observations: [] };
  }
  const observations = barMetrics.map(({ metric, read }): Observation => {
    const measured = samples.map(read);
    return {
      environment,
      lane: "gpu",
      metric,
      note: `worst of ${samples.length} windows`,
      paired: null,
      runs: { a: [], b: measured },
      scenario: null,
      value: Math.max(...measured),
    };
  });
  return { failures, observations };
};
