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

interface Camera {
  readonly key: string;
  readonly value: string;
}

interface View {
  readonly camera: Camera | null;
  readonly frames: number;
  readonly from: number;
  readonly id: string;
  readonly path: string;
  readonly race: boolean;
  readonly ready: string;
  readonly to: number;
  readonly warm: number;
}

const BENCH_READY = "globalThis.__rushlineBench !== undefined";
const ROAD_FROM = 700;
const ROAD_TO = 1900;
const ROAD_FRAMES = 600;

export const views = [
  {
    camera: { key: "rushline.bar-camera", value: "room" },
    frames: 1200,
    from: 300,
    id: "bar",
    path: "/bar?prof&time=dusk",
    race: false,
    ready: "globalThis.__rushlineBar !== undefined",
    to: 1500,
    warm: 1500,
  },
  {
    camera: null,
    frames: ROAD_FRAMES,
    from: ROAD_FROM,
    id: "breakwater",
    path: "/?stress=breakwater",
    race: true,
    ready: BENCH_READY,
    to: ROAD_TO,
    warm: 120,
  },
  {
    camera: null,
    frames: ROAD_FRAMES,
    from: ROAD_FROM,
    id: "ridge",
    path: "/?stress=ridge",
    race: true,
    ready: BENCH_READY,
    to: ROAD_TO,
    warm: 120,
  },
] as const satisfies readonly View[];

export type ViewId = (typeof views)[number]["id"];

export const VIEW_SAMPLES = 5;

export const viewCapture = Schema.Struct({
  camera: Schema.NullOr(Schema.String),
  frames: Schema.Array(gpuFrame),
  modes: Schema.NullOr(Schema.Array(Schema.String)),
  viewport: Schema.Struct({
    dpr: Schema.Number,
    height: Schema.Number,
    width: Schema.Number,
  }),
  visibility: Schema.String,
});

export interface ViewSample {
  readonly capture: typeof viewCapture.Type;
  readonly consoleErrors: number;
  readonly file: string;
  readonly view: ViewId;
}

const intervalAt = (share: number) => (sample: ViewSample) =>
  quantile(intervalsOf([sample]), share);

const viewReads = [
  { read: intervalAt(0.5), suffix: "frame.interval.p50", unit: "ms" },
  { read: intervalAt(0.95), suffix: "frame.interval.p95", unit: "ms" },
  { read: intervalAt(0.99), suffix: "frame.interval.p99", unit: "ms" },
  {
    read: (sample: ViewSample) => missedFractionOf([sample]),
    suffix: "frame.missedFraction",
    unit: "share",
  },
  {
    read: (sample: ViewSample) =>
      peakOf([sample], frameReaders["render.calls.max"]),
    suffix: "render.calls.max",
    unit: "calls",
  },
  {
    read: (sample: ViewSample) =>
      peakOf([sample], frameReaders["render.triangles.max"]),
    suffix: "render.triangles.max",
    unit: "triangles",
  },
] as const;

export const viewMetrics = views.flatMap((view) =>
  viewReads.map(({ read, suffix, unit }) => ({
    metric: `${view.id}.${suffix}`,
    read,
    unit,
    view: view.id,
  }))
);

type Page = ViewSample["capture"]["viewport"];

const rideProblems = (
  view: (typeof views)[number],
  { frames, modes }: ViewSample["capture"]
): string[] => {
  const firstRace = frames[0]?.race;
  const down = modes?.find((mode) => mode !== "riding");
  return [
    ...(frames.every((frame) => frame.race === firstRace)
      ? []
      : ["the window spans two races"]),
    ...(!view.race || (modes !== null && modes.length > 0)
      ? []
      : ["no bench rows for the window"]),
    ...(down === undefined
      ? []
      : [`the player was ${down} in the window, pick a new one`]),
  ];
};

const problemsOf = (
  view: (typeof views)[number],
  { capture, consoleErrors }: ViewSample,
  page: Page | null
): string[] => {
  const wanted = view.frames;
  const { dpr, height, width } = capture.viewport;
  return [
    ...(capture.camera === (view.camera?.value ?? null)
      ? []
      : [
          `camera=${capture.camera ?? "unset"} expected=${view.camera?.value ?? "unset"}`,
        ]),
    ...(capture.frames.length >= wanted
      ? []
      : [`frames=${capture.frames.length} expected>=${wanted}`]),
    ...(capture.frames.every((frame) => total(frame.calls) > 0)
      ? []
      : ["a frame drew nothing"]),
    ...rideProblems(view, capture),
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

const viewResult = (
  view: (typeof views)[number],
  samples: readonly ViewSample[],
  environment: string,
  page: Page | null
) => {
  const failures = [
    ...(samples.length === VIEW_SAMPLES
      ? []
      : [`FAIL ${view.id} samples=${samples.length} expected=${VIEW_SAMPLES}`]),
    ...samples.flatMap((sample) =>
      problemsOf(view, sample, page).map(
        (problem) => `FAIL ${view.id} ${sample.file} ${problem}`
      )
    ),
  ];
  if (failures.length > 0) {
    return { failures, observations: [] };
  }
  const observations = viewMetrics
    .filter((each) => each.view === view.id)
    .map(({ metric, read }): Observation => {
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

export const viewsResult = (
  samples: readonly ViewSample[],
  environment: string,
  page: Page | null
) => {
  const results = views.map((view) =>
    viewResult(
      view,
      samples.filter((sample) => sample.view === view.id),
      environment,
      page
    )
  );
  return {
    failures: results.flatMap((each) => each.failures),
    observations: results.flatMap((each) => each.observations),
  };
};
