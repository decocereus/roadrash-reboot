import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { BAR_BENCH, barCapture } from "./gpu-bar.ts";
import type { BarSample } from "./gpu-bar.ts";
import { clockOfCapture, whileSampling } from "./gpu-clock.ts";
import {
  assertParked,
  consoleErrors,
  failed,
  OPEN_TIMEOUT_S,
  PARK,
  rv,
  WINDOW_TIMEOUT_S,
} from "./gpu-rv.ts";
import type { SampleBench } from "./gpu-sample.ts";

const READY =
  "globalThis.__rushlineBar !== undefined && globalThis.__rushlineProfile !== undefined";
const REACHED = `globalThis.__rushlineProfile.info().tick >= ${BAR_BENCH.to}`;
const SET_CAMERA = `void localStorage.setItem("${BAR_BENCH.cameraKey}", "${BAR_BENCH.camera}")`;
const COLLECT = `(() => ({
  camera: localStorage.getItem("${BAR_BENCH.cameraKey}"),
  frames: globalThis.__rushlineProfile.window(${BAR_BENCH.from}, ${BAR_BENCH.to}),
  timeOrigin: performance.timeOrigin,
  viewport: { dpr: devicePixelRatio, height: innerHeight, width: innerWidth },
  visibility: document.visibilityState,
}))()`;

const decodeCapture = Schema.decodeUnknownEffect(
  Schema.fromJsonString(barCapture)
);

const rideWindow = (run: string) =>
  rv([
    "open",
    "--run",
    run,
    BAR_BENCH.path,
    "--until",
    READY,
    "--timeout",
    String(OPEN_TIMEOUT_S),
  ]).pipe(
    Effect.andThen(
      rv(["wait", "--run", run, REACHED, "--timeout", String(WINDOW_TIMEOUT_S)])
    )
  );

interface BarRuns {
  readonly idle: string;
  readonly measured: string;
}

const sampleBar = Effect.fnUntraced(function* sampleBar(
  bench: SampleBench,
  runs: BarRuns,
  index: number
) {
  const fs = yield* FileSystem.FileSystem;
  const run = runs.measured;
  const parkTries = yield* assertParked(runs.idle, bench.host.platform);
  const errorsBefore = yield* consoleErrors(run);
  const { readings, result: text } = yield* whileSampling(
    bench.source,
    rideWindow(run).pipe(Effect.andThen(rv(["js", "--run", run, COLLECT])))
  );
  const errorsAfter = yield* consoleErrors(run);
  yield* rv(["open", "--run", run, PARK]);
  const file = `bar-${index}.json`;
  yield* fs.writeFileString(path.join(bench.dir, "gpu", file), text);
  const capture = yield* decodeCapture(text).pipe(
    Effect.mapError(failed(`${file} is not a frame capture`))
  );
  const sample: BarSample = {
    capture,
    clock: clockOfCapture(bench.source, readings, capture),
    consoleErrors: errorsAfter - errorsBefore,
    file,
    parkTries,
  };
  return sample;
});

export const measureBar = Effect.fnUntraced(function* measureBar(
  bench: SampleBench,
  runs: BarRuns
) {
  const run = runs.measured;
  yield* rv(["open", "--run", run, PARK]);
  yield* rv(["js", "--run", run, SET_CAMERA]);
  yield* rideWindow(run);
  yield* rv(["open", "--run", run, PARK]);
  const samples: BarSample[] = [];
  for (let index = 0; index < BAR_BENCH.samples; index += 1) {
    samples.push(yield* sampleBar(bench, runs, index));
  }
  return samples;
});
