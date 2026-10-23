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
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
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

const measureOnce = (options: Options, run: number) =>
  Effect.scoped(
    Effect.gen(function* measureRun() {
      const fs = yield* FileSystem.FileSystem;
      const page = yield* launch(
        options.port,
        options.viewport,
        options.browser
      );
      const deadline = (yield* Clock.currentTimeMillis) + TIMEOUT_MS;
      yield* page.send("Page.enable");
      yield* page.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: options.viewport.scale,
        height: options.viewport.height,
        mobile: false,
        width: options.viewport.width,
      });
      yield* page.send("Page.navigate", { url: options.url });
      yield* options.firstRun
        ? waitForCountdown(page, deadline)
        : waitForTick(page, options.from, deadline);
      const trace: Collected = { events: [], raw: [] };
      if (options.trace) {
        yield* startTrace(
          page,
          trace,
          options.firstRun ? FIRST_RUN_CATEGORIES : TRACE_CATEGORIES
        );
      }
      const pageNow = options.trace ? yield* pageClock(page) : 0;
      yield* waitForTick(page, options.from, deadline);
      if (options.cpuProfile) {
        yield* page.send("Profiler.enable");
        yield* page.send("Profiler.setSamplingInterval", {
          interval: SAMPLING_MICROS,
        });
        yield* page.send("Profiler.start");
      }
      if (options.allocProfile) {
        yield* page.send("HeapProfiler.enable");
        yield* page.send("HeapProfiler.startSampling", {
          includeObjectsCollectedByMajorGC: true,
          includeObjectsCollectedByMinorGC: true,
          samplingInterval: ALLOCATION_SAMPLING_BYTES,
        });
      }
      const [loadBefore = 0] = loadavg();
      const heapBefore = yield* page.call(
        "Runtime.getHeapUsage",
        {},
        heapUsage
      );
      const shots = yield* shoot(page, options, run, deadline);
      yield* waitForTick(page, options.to + 1, deadline);
      const heapAfter = yield* page.call("Runtime.getHeapUsage", {}, heapUsage);
      const profile = options.cpuProfile
        ? yield* page.call("Profiler.stop", {}, cpuProfile)
        : null;
      const allocated = options.allocProfile
        ? yield* page.call("HeapProfiler.stopSampling", {}, allocationProfile)
        : null;
      if (options.trace) {
        yield* stopTrace(page);
      }
      const { events, raw: traceEvents } = trace;
      if (options.saveTrace) {
        yield* fs.writeFileString(
          path.join(options.out, `${options.label}-run${run}-trace.json`),
          JSON.stringify({ traceEvents })
        );
      }
      const marked = clockMarkMicros(events);
      const offsetMicros = marked === null ? null : marked - pageNow * 1000;
      const info = yield* evaluate(
        page,
        "globalThis.__rushlineProfile.info()",
        profileInfo
      );
      const recorded = yield* evaluate(
        page,
        `globalThis.__rushlineProfile.window(${options.firstRun ? 0 : options.from}, ${options.to})`,
        Schema.Array(frameSample)
      );
      const frames = options.firstRun
        ? afterGreenLight(recorded, options.from)
        : recorded;
      const measured = yield* evaluate(
        page,
        "({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio })",
        pageSize
      );
      const allocations = allocated
        ? yield* allocationSites(allocated, TOP_FUNCTIONS)
        : null;
      const hot = profile ? yield* hottest(profile, TOP_FUNCTIONS) : null;
      const result: RunResult = {
        ...summarise(frames, info.parts),
        allocations,
        frames: frames.length,
        gcEventNames: options.trace ? gcNamesSeen(events) : [],
        gpuTimer: info.gpuTimer,
        growth: growthOf(frames),
        heapAfter,
        heapBefore,
        hot,
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
        stalls: stallsOf(
          frames,
          info.parts,
          events,
          offsetMicros,
          options.worst
        ),
        trace: options.trace ? summariseTrace(events) : null,
      };
      return result;
    })
  );

const runAll = Effect.fnUntraced(function* runAll(options: Options) {
  const results: RunResult[] = [];
  for (let run = 1; run <= options.runs; run += 1) {
    const result = yield* measureOnce(options, run);
    yield* Effect.sync(() => {
      printRun(result);
    });
    results.push(result);
  }
  return results;
});

export const main = Effect.fn("measure.main")(function* main(options: Options) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(options.out, { recursive: true });
  const results = yield* runAll(options);
  yield* Effect.sync(() => {
    printSummary(options, results);
  });
  const file = path.join(
    options.out,
    `${options.label}-${yield* Clock.currentTimeMillis}.json`
  );
  yield* fs.writeFileString(
    file,
    JSON.stringify({ options, results }, null, 1)
  );
  yield* Effect.sync(() => {
    console.log(`\nsaved ${file}`);
  });
});
