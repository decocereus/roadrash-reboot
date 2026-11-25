import path from "node:path";

import type { BrowserHost } from "@racer/devtools/browser-host";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { clockOfCapture, whileSampling } from "./gpu-clock.ts";
import type { ClockSource } from "./gpu-clock.ts";
import { pageCapture, racedCapture } from "./gpu-frames.ts";
import type { GpuSample } from "./gpu-frames.ts";
import {
  readPark,
  consoleErrors,
  failed,
  OPEN_TIMEOUT_S,
  PARK,
  rv,
  WINDOW_TIMEOUT_S,
} from "./gpu-rv.ts";
import type { Scenario } from "./scenarios.ts";
import type { SideName } from "./sides.ts";

export const SETTINGS_KEY = "rushline.settings.v1";
export const READY =
  "globalThis.__rushlineBench !== undefined && globalThis.__rushlineProfile !== undefined";

export interface SampleBench {
  readonly dir: string;
  readonly host: Pick<BrowserHost, "platform">;
  readonly source: ClockSource;
}

const decodeInstalled = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({ tick: Schema.Number, visibility: Schema.String })
  )
);

const decodeCapture = Schema.decodeUnknownEffect(
  Schema.fromJsonString(pageCapture)
);

const decodeRaced = Schema.decodeUnknownEffect(
  Schema.fromJsonString(racedCapture)
);

const INSTALL = `(() => {
  const store = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      store.push({ duration: entry.duration, name: entry.name, start: entry.startTime });
    }
  });
  observer.observe({ buffered: true, type: "longtask" });
  globalThis.__perfLongTasks = { observer, store };
  return { tick: globalThis.__rushlineBench.info().lastTick, visibility: document.visibilityState };
})()`;

const rideTo = (to: number) => `
    ride: profile
      .window(0, ${to})
      .filter((frame) => frame.race === info.race)
      .map(({ created, frame, tick }) => ({ created, frame, tick })),`;

const collect = ({ window }: Scenario, side: SideName) => `(() => {
  const tasks = globalThis.__perfLongTasks;
  for (const entry of tasks.observer.takeRecords()) {
    tasks.store.push({ duration: entry.duration, name: entry.name, start: entry.startTime });
  }
  tasks.observer.disconnect();
  const bench = globalThis.__rushlineBench;
  const info = bench.info();
  const profile = globalThis.__rushlineProfile;
  return {
    bench: info,
    frameRate: JSON.parse(localStorage.getItem("${SETTINGS_KEY}") ?? "{}").frameRate ?? null,
    frames: profile.window(${window.from}, ${window.to}),
    longTasks: tasks.store,${side === "B" ? rideTo(window.to) : ""}
    parts: profile.info().parts,
    rows: bench.window(${window.from}, ${window.to}),
    timeOrigin: performance.timeOrigin,
    viewport: { dpr: devicePixelRatio, height: innerHeight, width: innerWidth },
    visibility: document.visibilityState,
  };
})()`;

export const racePath = (scenario: Scenario): string =>
  scenario.bench === "reference"
    ? "/?stress=reference&rung=0"
    : "/?stress&rung=0";

export const reached = (tick: number): string =>
  `globalThis.__rushlineBench.info().lastTick >= ${tick}`;

export const sampleOnce = Effect.fnUntraced(function* sampleOnce(
  bench: SampleBench,
  runs: { readonly idle: string; readonly measured: string },
  where: Pick<GpuSample, "pair" | "position" | "side">,
  scenario: Scenario
) {
  const fs = yield* FileSystem.FileSystem;
  const run = runs.measured;
  const park = yield* readPark(runs.idle, bench.host.platform);
  const errorsBefore = yield* consoleErrors(run);
  yield* rv([
    "open",
    "--run",
    run,
    racePath(scenario),
    "--until",
    READY,
    "--timeout",
    String(OPEN_TIMEOUT_S),
  ]);
  const installed = yield* rv(["js", "--run", run, INSTALL]).pipe(
    Effect.flatMap(decodeInstalled),
    Effect.mapError(failed(`long-task observer on ${run}`))
  );
  const { result: text, sampled } = yield* whileSampling(
    bench.source,
    rv([
      "wait",
      "--run",
      run,
      reached(scenario.window.to),
      "--timeout",
      String(WINDOW_TIMEOUT_S),
    ]).pipe(
      Effect.andThen(rv(["js", "--run", run, collect(scenario, where.side)]))
    )
  );
  const errorsAfter = yield* consoleErrors(run);
  yield* rv(["open", "--run", run, PARK]);
  const file = `${scenario.id}-pair${where.pair}-${where.side}.json`;
  yield* fs.writeFileString(path.join(bench.dir, "gpu", file), text);
  const fields = {
    consoleErrors: errorsAfter - errorsBefore,
    file,
    installed,
    pair: where.pair,
    park,
    position: where.position,
    run,
    scenario: scenario.id,
  };
  const notCapture = failed(`${file} is not a frame capture`);
  if (where.side === "A") {
    const capture = yield* decodeCapture(text).pipe(
      Effect.mapError(notCapture)
    );
    const sample: GpuSample = {
      ...fields,
      capture,
      clock: clockOfCapture(bench.source, sampled, capture),
      side: "A",
    };
    return sample;
  }
  const capture = yield* decodeRaced(text).pipe(Effect.mapError(notCapture));
  const sample: GpuSample = {
    ...fields,
    capture,
    clock: clockOfCapture(bench.source, sampled, capture),
    side: "B",
  };
  return sample;
});
