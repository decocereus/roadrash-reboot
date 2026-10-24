import * as Schema from "effect/Schema";

import {
  GPU_ENVIRONMENT,
  judge,
  metricKinds,
  requiredRows,
} from "./budgets.ts";
import type { Limit, MetricKind, Observation } from "./budgets.ts";
import { median, quantile } from "./result.ts";
import {
  scenarios,
  validateWorkload,
  WINDOW_TICKS,
  workloadRows,
} from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";

export const GPU_PAIRS = 5;
export const FRAME_RATE = "60";

const SLOT_MS = 1000 / 60;
const MIN_FRAMES = 120;
const LONG_TASK_MS = 50;

const gpuKinds = metricKinds.filter((kind) => kind.lane === "gpu");

const gpuFrame = Schema.Struct({
  calls: Schema.Array(Schema.Number),
  cpu: Schema.Array(Schema.Number),
  discarded: Schema.Number,
  drawRung: Schema.Number,
  drawnEpoch: Schema.Number,
  frame: Schema.Number,
  interval: Schema.Number,
  pixelRatio: Schema.Number,
  programs: Schema.Number,
  race: Schema.Number,
  rung: Schema.Number,
  sizeEpoch: Schema.Number,
  start: Schema.Number,
  textures: Schema.Number,
  tick: Schema.Number,
  ticks: Schema.Number,
  triangles: Schema.Array(Schema.Number),
});

type GpuFrame = typeof gpuFrame.Type;

const longTask = Schema.Struct({
  duration: Schema.Number,
  name: Schema.String,
  start: Schema.Number,
});

type LongTask = typeof longTask.Type;

const rideFrame = Schema.Struct({
  created: Schema.Struct({ programs: Schema.Number, textures: Schema.Number }),
  frame: Schema.Number,
  tick: Schema.Number,
});

type RideFrame = typeof rideFrame.Type;

export const pageCapture = Schema.Struct({
  bench: Schema.Struct({
    bench: Schema.String,
    overflowed: Schema.Boolean,
    police: Schema.Number,
    race: Schema.Number,
    riders: Schema.Number,
  }),
  frameRate: Schema.NullOr(Schema.String),
  frames: Schema.Array(gpuFrame),
  longTasks: Schema.Array(longTask),
  parts: Schema.Array(Schema.String),
  rows: Schema.Struct({
    ...workloadRows.fields,
    times: Schema.Array(Schema.Number),
  }),
  viewport: Schema.Struct({
    dpr: Schema.Number,
    height: Schema.Number,
    width: Schema.Number,
  }),
  visibility: Schema.String,
});

export const racedCapture = Schema.Struct({
  ...pageCapture.fields,
  ride: Schema.Array(rideFrame),
});

type RacedCapture = typeof racedCapture.Type;

const sampleFields = {
  consoleErrors: Schema.Number,
  file: Schema.String,
  installed: Schema.Struct({
    tick: Schema.Number,
    visibility: Schema.String,
  }),
  pair: Schema.Number,
  position: Schema.Number,
  run: Schema.String,
  scenario: Schema.String,
};

const gpuSample = Schema.Union([
  Schema.Struct({
    ...sampleFields,
    capture: pageCapture,
    side: Schema.Literal("A"),
  }),
  Schema.Struct({
    ...sampleFields,
    capture: racedCapture,
    side: Schema.Literal("B"),
  }),
]);

export type GpuSample = typeof gpuSample.Type;

const total = (values: readonly number[]): number =>
  values.reduce((sum, each) => sum + each, 0);

const frameProblem = (
  scenario: Scenario,
  race: number,
  first: GpuFrame,
  frame: GpuFrame
): string | null => {
  const { ratio, rung } = scenario.quality;
  const where = `frame=${frame.frame} tick=${frame.tick}`;
  if (frame.race !== race) {
    return `${where} race=${frame.race} expected=${race}`;
  }
  if (
    frame.rung !== rung ||
    frame.drawRung !== rung ||
    frame.pixelRatio !== ratio
  ) {
    return `${where} rung=${frame.rung} drawn=${frame.drawRung} ratio=${frame.pixelRatio} expected=${rung}/${rung}/${ratio}`;
  }
  if (
    frame.sizeEpoch !== first.sizeEpoch ||
    frame.drawnEpoch !== frame.sizeEpoch
  ) {
    return `${where} epochs=${frame.sizeEpoch}/${frame.drawnEpoch} expected=${first.sizeEpoch}/${first.sizeEpoch}`;
  }
  if (frame.discarded > 0) {
    return `${where} discarded=${frame.discarded} ms expected=0`;
  }
  if (total(frame.calls) <= 0 || frame.programs <= 0 || frame.textures <= 0) {
    return `${where} calls=${total(frame.calls)} programs=${frame.programs} textures=${frame.textures} expected counters above 0`;
  }
  return null;
};

const sampleProblems = (scenario: Scenario, sample: GpuSample): string[] => {
  const { capture } = sample;
  const problems: string[] = [];
  const workload = validateWorkload(scenario, capture.rows);
  if (workload) {
    problems.push(
      `tick=${workload.tick} ${workload.field}=${workload.actual} expected=${workload.expected}`
    );
  }
  const { bench } = capture;
  if (
    bench.bench !== scenario.bench ||
    bench.riders - bench.police !== scenario.racers ||
    bench.police !== scenario.police ||
    bench.overflowed
  ) {
    problems.push(
      `bench=${bench.bench} racers=${bench.riders - bench.police} police=${bench.police} overflowed=${bench.overflowed} expected=${scenario.bench} ${scenario.racers}/${scenario.police}`
    );
  }
  const { times } = capture.rows;
  if (times.length !== WINDOW_TICKS || !times.every(Number.isFinite)) {
    problems.push(`tick times=${times.length} expected=${WINDOW_TICKS}`);
  }
  if (sample.installed.tick >= scenario.window.from) {
    problems.push(
      `long-task observer installed at tick=${sample.installed.tick} expected before ${scenario.window.from}`
    );
  }
  if (
    sample.installed.visibility !== "visible" ||
    capture.visibility !== "visible"
  ) {
    problems.push(
      `visibility=${sample.installed.visibility}/${capture.visibility} expected=visible`
    );
  }
  if (capture.frameRate !== FRAME_RATE) {
    problems.push(
      `frameRate=${capture.frameRate ?? "unset"} expected=${FRAME_RATE}`
    );
  }
  if (sample.consoleErrors > 0) {
    problems.push(`console errors=${sample.consoleErrors} expected=0`);
  }
  const [first] = capture.frames;
  if (!first || capture.frames.length < MIN_FRAMES) {
    problems.push(
      `frames=${capture.frames.length} expected>=${MIN_FRAMES} in ${scenario.window.from}..${scenario.window.to}`
    );
    return problems;
  }
  const bad = capture.frames
    .map((frame) => frameProblem(scenario, bench.race, first, frame))
    .find((each) => each !== null);
  if (bad !== undefined) {
    problems.push(bad);
  }
  return problems;
};

const firstUseResources = ["programs", "textures"] as const;

const SHOWN_STEPS = 12;

const growthOf = (
  ride: readonly RideFrame[],
  start: RideFrame,
  resource: (typeof firstUseResources)[number]
): string[] => {
  const made =
    (ride.at(-1) ?? start).created[resource] - start.created[resource];
  if (made === 0) {
    return [];
  }
  const steps = ride.flatMap((frame, index) => {
    const step =
      frame.created[resource] - (ride[index - 1] ?? frame).created[resource];
    return step > 0
      ? [`+${step} at frame=${frame.frame} tick=${frame.tick}`]
      : [];
  });
  const more =
    steps.length > SHOWN_STEPS ? `, ${steps.length - SHOWN_STEPS} more` : "";
  return [
    `${resource} created after the first race frame: ${made} (${steps.slice(0, SHOWN_STEPS).join(", ")}${more})`,
  ];
};

const firstUseProblems = ({ ride }: RacedCapture): string[] => {
  const [start] = ride;
  if (start?.tick !== 0) {
    return [`race frames start at tick=${start?.tick ?? "none"} expected=0`];
  }
  return firstUseResources.flatMap((resource) =>
    growthOf(ride, start, resource)
  );
};

const firstUseOf = (samples: readonly GpuSample[]) => {
  const raced = samples.filter((sample) => sample.side === "B");
  const failures = raced.flatMap((sample) =>
    firstUseProblems(sample.capture).map(
      (problem) =>
        `FAIL first-use ${sample.scenario} side=B ${sample.file} ${problem}`
    )
  );
  const held =
    raced.length > 0 && failures.length === 0
      ? [
          `ok   first-use side=B created no shader program or texture after the first race frame in ${raced.length} races of ${[...new Set(raced.map((sample) => sample.scenario))].join(" and ")}; what only other roads or untriggered effects draw is unchecked`,
        ]
      : [];
  return { failures, held };
};

const missedSlots = (interval: number): number =>
  Math.max(0, Math.round(interval / SLOT_MS) - 1);

const blocking = (task: LongTask, begin: number, end: number): number =>
  Math.max(
    0,
    Math.min(task.start + task.duration, end) -
      Math.max(task.start + LONG_TASK_MS, begin)
  );

const longTasksIn = (sample: GpuSample): LongTask[] => {
  const { times } = sample.capture.rows;
  const begin = times[0] ?? Number.NaN;
  const end = times.at(-1) ?? Number.NaN;
  return sample.capture.longTasks.filter(
    (task) =>
      task.duration > LONG_TASK_MS &&
      task.start < end &&
      task.start + task.duration > begin
  );
};

const blockingOf = (sample: GpuSample): number => {
  const { times } = sample.capture.rows;
  const begin = times[0] ?? Number.NaN;
  const end = times.at(-1) ?? Number.NaN;
  return total(longTasksIn(sample).map((task) => blocking(task, begin, end)));
};

const intervalsOf = (samples: readonly GpuSample[]): number[] =>
  samples
    .flatMap((sample) => sample.capture.frames.map((frame) => frame.interval))
    .toSorted((left, right) => left - right);

const missedFractionOf = (samples: readonly GpuSample[]): number => {
  const intervals = intervalsOf(samples);
  const missed = total(intervals.map(missedSlots));
  return missed / (intervals.length + missed);
};

const partTimesOf = (samples: readonly GpuSample[], part: string): number[] =>
  samples
    .flatMap(({ capture }) => {
      const column = capture.parts.indexOf(part);
      return capture.frames.map((frame) => frame.cpu[column] ?? Number.NaN);
    })
    .toSorted((left, right) => left - right);

const shares = {
  "frame.interval.p50": 0.5,
  "frame.interval.p95": 0.95,
  "frame.interval.p99": 0.99,
} as const;

const judgedPerWindow: ReadonlySet<string> = new Set([
  "frame.interval.p50",
  "frame.interval.p95",
  "frame.interval.p99",
  "frame.missedFraction",
  "riders.cpu.p95",
]);

const frameReaders = {
  "render.calls.max": (frame: GpuFrame) => total(frame.calls),
  "render.programs.max": (frame: GpuFrame) => frame.programs,
  "render.textures.max": (frame: GpuFrame) => frame.textures,
  "render.triangles.max": (frame: GpuFrame) => total(frame.triangles),
};

const peakOf = (
  samples: readonly GpuSample[],
  read: (frame: GpuFrame) => number
): number =>
  Math.max(...samples.flatMap((sample) => sample.capture.frames.map(read)));

const isCount = (metric: string): metric is keyof typeof frameReaders =>
  Object.hasOwn(frameReaders, metric);

const valueOf = (metric: string, samples: readonly GpuSample[]): number => {
  if (isCount(metric)) {
    return peakOf(samples, frameReaders[metric]);
  }
  if (metric === "frame.missedFraction") {
    return missedFractionOf(samples);
  }
  if (metric === "main.longTask.count") {
    return total(samples.map((sample) => longTasksIn(sample).length));
  }
  if (metric === "main.longTask.blockingMs") {
    return total(samples.map(blockingOf));
  }
  if (metric === "riders.cpu.p95") {
    return quantile(partTimesOf(samples, "riders"), 0.95);
  }
  const share =
    metric === "frame.interval.p50" ||
    metric === "frame.interval.p95" ||
    metric === "frame.interval.p99"
      ? shares[metric]
      : Number.NaN;
  return quantile(intervalsOf(samples), share);
};

const pairedOf = (
  kind: MetricKind,
  a: readonly GpuSample[],
  b: readonly GpuSample[]
): number | null =>
  kind.paired === null
    ? null
    : median(
        b.map(
          (each, index) =>
            valueOf(kind.metric, [each]) /
            valueOf(kind.metric, a.slice(index, index + 1))
        )
      );

const observationOf = (
  scenario: Scenario,
  kind: MetricKind,
  a: readonly GpuSample[],
  b: readonly GpuSample[]
): Observation => {
  const runs = {
    a: a.map((each) => valueOf(kind.metric, [each])),
    b: b.map((each) => valueOf(kind.metric, [each])),
  };
  const pooled = { a: valueOf(kind.metric, a), b: valueOf(kind.metric, b) };
  const observed = {
    environment: GPU_ENVIRONMENT,
    lane: "gpu",
    metric: kind.metric,
    paired: pairedOf(kind, a, b),
    runs,
    scenario: scenario.id,
  } as const;
  if (!judgedPerWindow.has(kind.metric)) {
    return {
      ...observed,
      note: `A=${pooled.a.toPrecision(5)}`,
      value: pooled.b,
    };
  }
  return {
    ...observed,
    note: `A=${Math.max(...runs.a).toPrecision(5)} (worst of ${b.length} windows; pooled B=${pooled.b.toPrecision(5)} A=${pooled.a.toPrecision(5)})`,
    value: Math.max(...runs.b),
  };
};

const byPair = (
  samples: readonly GpuSample[],
  side: GpuSample["side"]
): GpuSample[] =>
  samples
    .filter((sample) => sample.side === side)
    .toSorted((left, right) => left.pair - right.pair);

const countsOf = (samples: readonly GpuSample[]) => {
  const cpu = samples
    .flatMap((sample) => sample.capture.frames.map((frame) => total(frame.cpu)))
    .toSorted((left, right) => left - right);
  return {
    calls: valueOf("render.calls.max", samples),
    cpuP50: quantile(cpu, 0.5),
    cpuP95: quantile(cpu, 0.95),
    programs: valueOf("render.programs.max", samples),
    textures: valueOf("render.textures.max", samples),
    triangles: valueOf("render.triangles.max", samples),
    worstMs: peakOf(samples, (frame) => frame.interval),
  };
};

const gpuRows = requiredRows(["gpu"], []);

const viewportText = ({ viewport }: GpuSample["capture"]): string =>
  `${viewport.width}x${viewport.height}@${viewport.dpr}`;

const scenarioResult = (scenario: Scenario, mine: readonly GpuSample[]) => {
  const failures = mine.flatMap((sample) =>
    sampleProblems(scenario, sample).map(
      (problem) =>
        `FAIL workload ${scenario.id} side=${sample.side} ${sample.file} ${problem}`
    )
  );
  const [first] = mine;
  const expected = first ? viewportText(first.capture) : "";
  failures.push(
    ...mine
      .filter((sample) => viewportText(sample.capture) !== expected)
      .map(
        (sample) =>
          `FAIL gpu ${scenario.id} side=${sample.side} ${sample.file} viewport=${viewportText(sample.capture)} expected=${expected} like ${first?.file ?? "the first sample"}`
      )
  );
  const a = byPair(mine, "A");
  const b = byPair(mine, "B");
  if (a.length !== GPU_PAIRS || b.length !== GPU_PAIRS) {
    failures.push(
      `FAIL gpu ${scenario.id} has ${a.length}/${b.length} A/B samples, expected ${GPU_PAIRS} pairs`
    );
  }
  if (failures.length > 0) {
    return { counts: null, failures, observations: [] };
  }
  const observations = gpuKinds.map((kind) =>
    observationOf(scenario, kind, a, b)
  );
  return { counts: { A: countsOf(a), B: countsOf(b) }, failures, observations };
};

const peaksText = (peaks: ReturnType<typeof countsOf>): string =>
  `calls=${peaks.calls} triangles=${peaks.triangles} programs=${peaks.programs} textures=${peaks.textures} worst=${peaks.worstMs.toFixed(1)} ms frame cpu p50=${peaks.cpuP50.toFixed(2)} p95=${peaks.cpuP95.toFixed(2)} ms`;

export const evaluateGpu = (
  samples: readonly GpuSample[],
  limits: readonly Limit[]
) => {
  const results = scenarios.map((scenario) => ({
    scenario: scenario.id,
    ...scenarioResult(
      scenario,
      samples.filter((sample) => sample.scenario === scenario.id)
    ),
  }));
  const firstUse = firstUseOf(samples);
  const failures = [
    ...results.flatMap((each) => each.failures),
    ...firstUse.failures,
  ];
  const observations = results.flatMap((each) => each.observations);
  const verdicts = judge(limits, observations, gpuRows);
  const counts = results.map(({ counts: peaks, scenario }) => ({
    peaks,
    scenario,
  }));
  return {
    counts,
    lines: [
      ...failures,
      ...verdicts.map((verdict) => verdict.text),
      ...firstUse.held,
      ...counts.flatMap(({ peaks, scenario }) =>
        peaks
          ? [
              `info gpu ${scenario} A ${peaksText(peaks.A)}; B ${peaksText(peaks.B)}`,
            ]
          : []
      ),
    ],
    observations,
    ok: failures.length === 0 && verdicts.every((verdict) => verdict.ok),
  };
};
