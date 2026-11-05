import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { BAR_BENCH, barCapture } from "./gpu-bar.ts";
import type { BarSample } from "./gpu-bar.ts";
import {
  consoleErrors,
  failed,
  OPEN_TIMEOUT_S,
  PARK,
  rv,
  WINDOW_TIMEOUT_S,
} from "./gpu-rv.ts";

const READY =
  "globalThis.__rushlineBar !== undefined && globalThis.__rushlineProfile !== undefined";
const REACHED = `globalThis.__rushlineProfile.info().tick >= ${BAR_BENCH.to}`;
const SET_CAMERA = `void localStorage.setItem("${BAR_BENCH.cameraKey}", "${BAR_BENCH.camera}")`;
const COLLECT = `(() => ({
  camera: localStorage.getItem("${BAR_BENCH.cameraKey}"),
  frames: globalThis.__rushlineProfile.window(${BAR_BENCH.from}, ${BAR_BENCH.to}),
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

const sampleBar = Effect.fnUntraced(function* sampleBar(
  dir: string,
  run: string,
  index: number
) {
  const fs = yield* FileSystem.FileSystem;
  const errorsBefore = yield* consoleErrors(run);
  yield* rideWindow(run);
  const text = yield* rv(["js", "--run", run, COLLECT]);
  const errorsAfter = yield* consoleErrors(run);
  yield* rv(["open", "--run", run, PARK]);
  const file = `bar-${index}.json`;
  yield* fs.writeFileString(path.join(dir, "gpu", file), text);
  const sample: BarSample = {
    capture: yield* decodeCapture(text).pipe(
      Effect.mapError(failed(`${file} is not a frame capture`))
    ),
    consoleErrors: errorsAfter - errorsBefore,
    file,
  };
  return sample;
});

export const measureBar = Effect.fnUntraced(function* measureBar(
  dir: string,
  run: string
) {
  yield* rv(["open", "--run", run, PARK]);
  yield* rv(["js", "--run", run, SET_CAMERA]);
  yield* rideWindow(run);
  yield* rv(["open", "--run", run, PARK]);
  const samples: BarSample[] = [];
  for (let index = 0; index < BAR_BENCH.samples; index += 1) {
    samples.push(yield* sampleBar(dir, run, index));
  }
  return samples;
});
