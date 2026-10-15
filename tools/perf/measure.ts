import { mkdir, writeFile } from "node:fs/promises";
import { cpus, loadavg } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { Schema } from "effect";

import { benchWindow } from "../../apps/web/src/career/bench-window.ts";
import {
  cpuProfile,
  gcNamesSeen,
  hottest,
  summariseTrace,
  traceEvent,
} from "./analysis.ts";
import type { Hotspots, TraceSummary } from "./analysis.ts";
import { evaluate } from "./cdp.ts";
import type { Session } from "./cdp.ts";
import { launch } from "./chrome.ts";
import type { Viewport } from "./chrome.ts";

const POLL_MS = 40;
const TIMEOUT_MS = 240_000;
const TOP_FUNCTIONS = 30;
const SAMPLING_MICROS = 100;
const TRACE_CATEGORIES = ["devtools.timeline"];

const frameSample = Schema.Struct({
  calls: Schema.Array(Schema.Number),
  cpu: Schema.Array(Schema.Number),
  frame: Schema.Number,
  gpu: Schema.NullOr(Schema.Array(Schema.Number)),
  interval: Schema.Number,
  pixelRatio: Schema.Number,
  rung: Schema.Number,
  tick: Schema.Number,
  ticks: Schema.Number,
  triangles: Schema.Array(Schema.Number),
});

type Frame = typeof frameSample.Type;

const profileInfo = Schema.Struct({
  frames: Schema.Number,
  gpuTimer: Schema.Boolean,
  parts: Schema.Array(Schema.String),
  renderer: Schema.String,
  tick: Schema.Number,
});

const pageSize = Schema.Struct({
  height: Schema.Number,
  ratio: Schema.Number,
  width: Schema.Number,
});

const heapUsage = Schema.Struct({
  totalSize: Schema.Number,
  usedSize: Schema.Number,
});

const collected = Schema.Struct({ value: Schema.Array(Schema.Unknown) });

const decodeEvent = Schema.decodeUnknownSync(traceEvent);

const screenshot = Schema.Struct({ data: Schema.String });

interface Options {
  readonly url: string;
  readonly label: string;
  readonly runs: number;
  readonly from: number;
  readonly to: number;
  readonly port: number;
  readonly out: string;
  readonly trace: boolean;
  readonly cpuProfile: boolean;
  readonly saveTrace: boolean;
  readonly shots: readonly number[];
  readonly viewport: Viewport;
}

interface Stats {
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

interface PartSummary {
  readonly part: string;
  readonly cpu: Stats;
  readonly gpu: Stats | null;
  readonly calls: number;
  readonly triangles: number;
}

interface RunResult {
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
  readonly shots: readonly string[];
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

const mean = (values: readonly number[]): number =>
  values.length > 0
    ? values.reduce((sum, each) => sum + each, 0) / values.length
    : 0;

const sum = (values: readonly number[]): number =>
  values.reduce((total, each) => total + each, 0);

const readOptions = (): Options => {
  const { values } = parseArgs({
    options: {
      "cpu-profile": { default: false, type: "boolean" },
      from: { default: String(benchWindow.from), type: "string" },
      height: { default: "860", type: "string" },
      label: { default: "run", type: "string" },
      "no-trace": { default: false, type: "boolean" },
      out: { default: "tools/perf/results", type: "string" },
      port: { default: "9333", type: "string" },
      runs: { default: "3", type: "string" },
      "save-trace": { default: false, type: "boolean" },
      scale: { default: "2", type: "string" },
      shots: { default: "", type: "string" },
      to: { default: String(benchWindow.to), type: "string" },
      url: { type: "string" },
      width: { default: "1512", type: "string" },
    },
  });
  if (!values.url) {
    throw new Error(
      "Pass --url, for example http://localhost:1352/?stress&ratio=2"
    );
  }
  return {
    cpuProfile: values["cpu-profile"],
    from: Number(values.from),
    label: values.label,
    out: values.out,
    port: Number(values.port),
    runs: Number(values.runs),
    saveTrace: values["save-trace"],
    shots: values.shots
      .split(",")
      .filter(Boolean)
      .map(Number)
      .toSorted((a, b) => a - b),
    to: Number(values.to),
    trace: !values["no-trace"],
    url: values.url,
    viewport: {
      height: Number(values.height),
      scale: Number(values.scale),
      width: Number(values.width),
    },
  };
};

const currentTick = (page: Session): Promise<number> =>
  evaluate(
    page,
    "globalThis.__rushlineProfile ? globalThis.__rushlineProfile.info().tick : -1",
    Schema.Number
  );

const waitForTick = async (
  page: Session,
  tick: number,
  deadline: number
): Promise<number> => {
  const now = await currentTick(page);
  if (now >= tick) {
    return now;
  }
  if (Date.now() > deadline) {
    throw new Error(`The race never reached tick ${tick}; it is at ${now}.`);
  }
  await sleep(POLL_MS);
  return waitForTick(page, tick, deadline);
};

const shoot = async (
  page: Session,
  options: Options,
  run: number,
  ticks: readonly number[],
  deadline: number
): Promise<string[]> => {
  const [next, ...rest] = ticks;
  if (next === undefined) {
    return [];
  }
  const reached = await waitForTick(page, next, deadline);
  const { data } = await page.call(
    "Page.captureScreenshot",
    { format: "png" },
    screenshot
  );
  const file = path.join(
    options.out,
    `${options.label}-run${run}-tick${reached}.png`
  );
  await writeFile(file, Buffer.from(data, "base64"));
  return [file, ...(await shoot(page, options, run, rest, deadline))];
};

const startTrace = async (
  page: Session,
  raw: (typeof collected.Type)["value"][]
) => {
  page.on("Tracing.dataCollected", collected, ({ value }) => {
    raw.push(value);
  });
  await page.send("Tracing.start", {
    traceConfig: { includedCategories: TRACE_CATEGORIES },
    transferMode: "ReportEvents",
  });
};

const stopTrace = async (page: Session) => {
  const { promise: complete, resolve } = Promise.withResolvers<boolean>();
  page.on("Tracing.tracingComplete", Schema.Unknown, () => resolve(true));
  await page.send("Tracing.end");
  await complete;
};

const summarise = (
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

const measureOnce = async (
  options: Options,
  run: number
): Promise<RunResult> => {
  const browser = await launch(options.port, options.viewport);
  const { page } = browser;
  const deadline = Date.now() + TIMEOUT_MS;
  try {
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: options.viewport.scale,
      height: options.viewport.height,
      mobile: false,
      width: options.viewport.width,
    });
    await page.send("Page.navigate", { url: options.url });
    await waitForTick(page, options.from, deadline);
    const raw: (typeof collected.Type)["value"][] = [];
    if (options.trace) {
      await startTrace(page, raw);
    }
    if (options.cpuProfile) {
      await page.send("Profiler.enable");
      await page.send("Profiler.setSamplingInterval", {
        interval: SAMPLING_MICROS,
      });
      await page.send("Profiler.start");
    }
    const [loadBefore = 0] = loadavg();
    const heapBefore = await page.call("Runtime.getHeapUsage", {}, heapUsage);
    const shots = await shoot(page, options, run, options.shots, deadline);
    await waitForTick(page, options.to + 1, deadline);
    const heapAfter = await page.call("Runtime.getHeapUsage", {}, heapUsage);
    const profile = options.cpuProfile
      ? await page.call("Profiler.stop", {}, cpuProfile)
      : null;
    if (options.trace) {
      await stopTrace(page);
    }
    const traceEvents = raw.flat();
    if (options.saveTrace) {
      await writeFile(
        path.join(options.out, `${options.label}-run${run}-trace.json`),
        JSON.stringify({ traceEvents })
      );
    }
    const events = traceEvents.map((event) => decodeEvent(event));
    const info = await evaluate(
      page,
      "globalThis.__rushlineProfile.info()",
      profileInfo
    );
    const frames = await evaluate(
      page,
      `globalThis.__rushlineProfile.window(${options.from}, ${options.to})`,
      Schema.Array(frameSample)
    );
    const measured = await evaluate(
      page,
      "({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio })",
      pageSize
    );
    return {
      ...summarise(frames, info.parts),
      frames: frames.length,
      gcEventNames: options.trace ? gcNamesSeen(events) : [],
      gpuTimer: info.gpuTimer,
      heapAfter,
      heapBefore,
      hot: profile ? await hottest(profile, TOP_FUNCTIONS) : null,
      load: (loadBefore + (loadavg()[0] ?? 0)) / 2,
      page: measured,
      pixelRatios: [...new Set(frames.map((frame) => frame.pixelRatio))],
      renderer: info.renderer,
      run,
      rungs: [...new Set(frames.map((frame) => frame.rung))],
      samples: frames,
      shots,
      trace: options.trace ? summariseTrace(events) : null,
    };
  } finally {
    await browser.close();
  }
};

const ms = (value: number): string => value.toFixed(2).padStart(7);

const spread = (values: readonly number[]): string =>
  `${ms(Math.min(...values))} - ${ms(Math.max(...values))}`;

const printRun = (result: RunResult) => {
  const { interval, trace } = result;
  console.log(
    `run ${result.run}: ${result.frames} frames  ${result.fps.toFixed(1)} fps  frame mean ${interval.mean.toFixed(2)} p50 ${interval.p50.toFixed(2)} p95 ${interval.p95.toFixed(2)} p99 ${interval.p99.toFixed(2)} worst ${interval.max.toFixed(2)} ms  js ${result.jsFrame.mean.toFixed(2)} ms  calls ${result.calls.mean.toFixed(0)}  tris ${(result.triangles.mean / 1e6).toFixed(2)} M  load ${result.load.toFixed(1)}/${cpus().length}`
  );
  if (trace) {
    console.log(
      `  gc minor ${trace.minorGc.count} (${trace.minorGc.totalMs.toFixed(1)} ms, max ${trace.minorGc.maxMs.toFixed(2)})  major ${trace.majorGc.count} (${trace.majorGc.totalMs.toFixed(1)} ms, max ${trace.majorGc.maxMs.toFixed(2)})  long tasks ${trace.longTasks.count}  longest task ${trace.longestTaskMs.toFixed(1)} ms over ${(trace.spanMs / 1000).toFixed(1)} s`
    );
  }
};

const printSummary = (options: Options, results: readonly RunResult[]) => {
  const [first] = results;
  if (!first) {
    return;
  }
  console.log(
    `\n${options.label}  ${options.url}  ticks ${options.from}-${options.to}`
  );
  console.log(`renderer  ${first.renderer}`);
  console.log(
    `page ${first.page.width}x${first.page.height} @${first.page.ratio}  pixel ratio ${first.pixelRatios.join(",")}  rung ${first.rungs.join(",")}  gpu timer ${first.gpuTimer ? "yes" : "not exposed"}  heap ${(first.heapAfter.usedSize / 1e6).toFixed(1)} MB`
  );
  const across = (pick: (result: RunResult) => number) =>
    `${ms(mean(results.map(pick)))}  [${spread(results.map(pick))}]`;
  console.log("metric             mean over runs  [min - max across runs]");
  console.log(`fps                ${across((r) => r.fps)}`);
  console.log(`frame mean ms      ${across((r) => r.interval.mean)}`);
  console.log(`frame p50 ms       ${across((r) => r.interval.p50)}`);
  console.log(`frame p95 ms       ${across((r) => r.interval.p95)}`);
  console.log(`frame p99 ms       ${across((r) => r.interval.p99)}`);
  console.log(`frame worst ms     ${across((r) => r.interval.max)}`);
  console.log(`js per frame ms    ${across((r) => r.jsFrame.mean)}`);
  console.log(`js p95 ms          ${across((r) => r.jsFrame.p95)}`);
  console.log(`draw calls         ${across((r) => r.calls.mean)}`);
  console.log(`triangles M        ${across((r) => r.triangles.mean / 1e6)}`);
  console.log(
    "\npart        cpu mean   cpu p95   gpu mean   gpu p95    calls   tris k"
  );
  for (const [index, part] of first.parts.entries()) {
    const of = (pick: (each: PartSummary) => number) =>
      mean(results.map((result) => pick(result.parts[index] ?? part)));
    const gpu = first.gpuTimer
      ? `${ms(of((each) => each.gpu?.mean ?? 0))}   ${ms(of((each) => each.gpu?.p95 ?? 0))}`
      : "      -         -";
    console.log(
      `${part.part.padEnd(10)} ${ms(of((each) => each.cpu.mean))}   ${ms(of((each) => each.cpu.p95))}   ${gpu}  ${of(
        (each) => each.calls
      )
        .toFixed(0)
        .padStart(
          6
        )}  ${(of((each) => each.triangles) / 1000).toFixed(0).padStart(6)}`
    );
  }
  for (const result of results) {
    if (result.hot) {
      console.log(
        `\nrun ${result.run} top JS self time: ${result.hot.busyMs.toFixed(0)} ms in named functions (GC included), ${result.hot.programMs.toFixed(0)} ms (program), ${result.hot.idleMs.toFixed(0)} ms idle`
      );
      for (const each of result.hot.top) {
        console.log(
          `${each.selfMs.toFixed(1).padStart(8)} ms ${(each.share * 100).toFixed(1).padStart(5)}%  ${each.name.padEnd(28)} ${each.where}`
        );
      }
    }
  }
};

const runAll = async (
  options: Options,
  run: number,
  done: readonly RunResult[]
): Promise<readonly RunResult[]> => {
  if (run > options.runs) {
    return done;
  }
  const result = await measureOnce(options, run);
  printRun(result);
  return runAll(options, run + 1, [...done, result]);
};

const main = async () => {
  const options = readOptions();
  await mkdir(options.out, { recursive: true });
  const results = await runAll(options, 1, []);
  printSummary(options, results);
  const file = path.join(options.out, `${options.label}-${Date.now()}.json`);
  await writeFile(file, JSON.stringify({ options, results }, null, 1));
  console.log(`\nsaved ${file}`);
};

await main();
