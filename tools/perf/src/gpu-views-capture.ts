import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import {
  consoleErrors,
  failed,
  OPEN_TIMEOUT_S,
  PARK,
  rv,
  WINDOW_TIMEOUT_S,
} from "./gpu-rv.ts";
import { VIEW_SAMPLES, viewCapture, views } from "./gpu-views.ts";
import type { ViewSample } from "./gpu-views.ts";

type View = (typeof views)[number];

const READY = (view: View) =>
  `${view.ready} && globalThis.__rushlineProfile !== undefined`;
const REACHED = (tick: number) =>
  `globalThis.__rushlineProfile.info().tick >= ${tick}`;
const SET_CAMERA = (view: View) =>
  view.camera === null
    ? null
    : `void localStorage.setItem("${view.camera.key}", "${view.camera.value}")`;
const COLLECT = (view: View) => `(() => ({
  camera: ${view.camera === null ? "null" : `localStorage.getItem("${view.camera.key}")`},
  frames: globalThis.__rushlineProfile.window(${view.from}, ${view.to}),
  modes: ${view.race ? `globalThis.__rushlineBench?.window(${view.from}, ${view.to}).modes ?? null` : "null"},
  viewport: { dpr: devicePixelRatio, height: innerHeight, width: innerWidth },
  visibility: document.visibilityState,
}))()`;

const decodeCapture = Schema.decodeUnknownEffect(
  Schema.fromJsonString(viewCapture)
);

const rideTo = (run: string, view: View, tick: number) =>
  rv([
    "open",
    "--run",
    run,
    view.path,
    "--until",
    READY(view),
    "--timeout",
    String(OPEN_TIMEOUT_S),
  ]).pipe(
    Effect.andThen(
      rv([
        "wait",
        "--run",
        run,
        REACHED(tick),
        "--timeout",
        String(WINDOW_TIMEOUT_S),
      ])
    )
  );

const sampleView = Effect.fnUntraced(function* sampleView(
  dir: string,
  run: string,
  view: View,
  index: number
) {
  const fs = yield* FileSystem.FileSystem;
  const errorsBefore = yield* consoleErrors(run);
  yield* rideTo(run, view, view.to);
  const text = yield* rv(["js", "--run", run, COLLECT(view)]);
  const errorsAfter = yield* consoleErrors(run);
  yield* rv(["open", "--run", run, PARK]);
  const file = `${view.id}-${index}.json`;
  yield* fs.writeFileString(path.join(dir, "gpu", file), text);
  const sample: ViewSample = {
    capture: yield* decodeCapture(text).pipe(
      Effect.mapError(failed(`${file} is not a frame capture`))
    ),
    consoleErrors: errorsAfter - errorsBefore,
    file,
    view: view.id,
  };
  return sample;
});

export const measureViews = Effect.fnUntraced(function* measureViews(
  dir: string,
  run: string
) {
  const samples: ViewSample[] = [];
  for (const view of views) {
    yield* rv(["open", "--run", run, PARK]);
    const camera = SET_CAMERA(view);
    if (camera !== null) {
      yield* rv(["js", "--run", run, camera]);
    }
    yield* rideTo(run, view, view.warm);
    yield* rv(["open", "--run", run, PARK]);
    for (let index = 0; index < VIEW_SAMPLES; index += 1) {
      samples.push(yield* sampleView(dir, run, view, index));
    }
  }
  return samples;
});
