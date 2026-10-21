import { mkdir, writeFile } from "node:fs/promises";
import { loadavg } from "node:os";
import path from "node:path";

import {
  clockMarkMicros,
  gcNamesSeen,
  summariseTrace,
} from "@racer/devtools/analysis";
import { evaluate } from "@racer/devtools/cdp";
import { launch } from "@racer/devtools/chrome";
import {
  allocationProfile,
  allocationSites,
  cpuProfile,
  hottest,
} from "@racer/devtools/profiles";
import * as Schema from "effect/Schema";

import {
  LATE_MS,
  afterGreenLight,
  frameSample,
  growthOf,
  heapUsage,
  pageSize,
  profileInfo,
  stallsOf,
  summarise,
} from "./measure-model.ts";
import type { RunResult } from "./measure-model.ts";
import { readOptions } from "./measure-options.ts";
import type { Options } from "./measure-options.ts";
import {
  FIRST_RUN_CATEGORIES,
  TRACE_CATEGORIES,
  pageClock,
  shoot,
  startTrace,
  stopTrace,
  waitForCountdown,
  waitForTick,
} from "./measure-page.ts";
import type { Collected } from "./measure-page.ts";
import { printRun, printSummary } from "./measure-report.ts";

const TIMEOUT_MS = 240_000;

const TOP_FUNCTIONS = 30;

const SAMPLING_MICROS = 100;

const ALLOCATION_SAMPLING_BYTES = 4096;

const measureOnce = async (
  options: Options,
  run: number
): Promise<RunResult> => {
  const browser = await launch(options.port, options.viewport, options.browser);
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
    await (options.firstRun
      ? waitForCountdown(page, deadline)
      : waitForTick(page, options.from, deadline));
    const trace: Collected = { events: [], raw: [] };
    if (options.trace) {
      await startTrace(
        page,
        trace,
        options.firstRun ? FIRST_RUN_CATEGORIES : TRACE_CATEGORIES
      );
    }
    const pageNow = options.trace ? await pageClock(page) : 0;
    await waitForTick(page, options.from, deadline);
    if (options.cpuProfile) {
      await page.send("Profiler.enable");
      await page.send("Profiler.setSamplingInterval", {
        interval: SAMPLING_MICROS,
      });
      await page.send("Profiler.start");
    }
    if (options.allocProfile) {
      await page.send("HeapProfiler.enable");
      await page.send("HeapProfiler.startSampling", {
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
        samplingInterval: ALLOCATION_SAMPLING_BYTES,
      });
    }
    const [loadBefore = 0] = loadavg();
    const heapBefore = await page.call("Runtime.getHeapUsage", {}, heapUsage);
    const shots = await shoot(page, options, run, options.shots, deadline);
    await waitForTick(page, options.to + 1, deadline);
    const heapAfter = await page.call("Runtime.getHeapUsage", {}, heapUsage);
    const profile = options.cpuProfile
      ? await page.call("Profiler.stop", {}, cpuProfile)
      : null;
    const allocated = options.allocProfile
      ? await page.call("HeapProfiler.stopSampling", {}, allocationProfile)
      : null;
    if (options.trace) {
      await stopTrace(page);
    }
    const { events, raw: traceEvents } = trace;
    if (options.saveTrace) {
      await writeFile(
        path.join(options.out, `${options.label}-run${run}-trace.json`),
        JSON.stringify({ traceEvents })
      );
    }
    const marked = clockMarkMicros(events);
    const offsetMicros = marked === null ? null : marked - pageNow * 1000;
    const info = await evaluate(
      page,
      "globalThis.__rushlineProfile.info()",
      profileInfo
    );
    const recorded = await evaluate(
      page,
      `globalThis.__rushlineProfile.window(${options.firstRun ? 0 : options.from}, ${options.to})`,
      Schema.Array(frameSample)
    );
    const frames = options.firstRun
      ? afterGreenLight(recorded, options.from)
      : recorded;
    const measured = await evaluate(
      page,
      "({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio })",
      pageSize
    );
    return {
      ...summarise(frames, info.parts),
      allocations: allocated
        ? await allocationSites(allocated, TOP_FUNCTIONS)
        : null,
      frames: frames.length,
      gcEventNames: options.trace ? gcNamesSeen(events) : [],
      gpuTimer: info.gpuTimer,
      growth: growthOf(frames),
      heapAfter,
      heapBefore,
      hot: profile ? await hottest(profile, TOP_FUNCTIONS) : null,
      late: LATE_MS.map(
        (limit) => frames.filter((frame) => frame.interval > limit).length
      ),
      load: (loadBefore + (loadavg()[0] ?? 0)) / 2,
      page: measured,
      pixelRatios: [...new Set(frames.map((frame) => frame.pixelRatio))],
      renderer: info.renderer,
      run,
      rungs: [...new Set(frames.map((frame) => frame.rung))],
      samples: frames,
      shots,
      stalls: stallsOf(frames, info.parts, events, offsetMicros, options.worst),
      trace: options.trace ? summariseTrace(events) : null,
    };
  } finally {
    await browser.close();
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
  return await runAll(options, run + 1, [...done, result]);
};

export const main = async () => {
  const options = readOptions();
  await mkdir(options.out, { recursive: true });
  const results = await runAll(options, 1, []);
  printSummary(options, results);
  const file = path.join(options.out, `${options.label}-${Date.now()}.json`);
  await writeFile(file, JSON.stringify({ options, results }, null, 1));
  console.log(`\nsaved ${file}`);
};
