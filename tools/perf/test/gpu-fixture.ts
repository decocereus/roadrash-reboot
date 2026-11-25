import type * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { BAR_BENCH } from "../src/gpu-bar.ts";
import type { BarSample } from "../src/gpu-bar.ts";
import { FRAME_RATE, GPU_PAIRS } from "../src/gpu-frames.ts";
import type { GpuSample } from "../src/gpu-frames.ts";
import type { ParkReading } from "../src/gpu-rv.ts";
import { scenarios, WINDOW_TICKS } from "../src/scenarios.ts";
import type { Scenario } from "../src/scenarios.ts";
import { validRows } from "./red-cases.ts";

export const QUIET: ParkReading = {
  page: '"/kit"',
  reason: null,
  renderers: [],
  run: "run-idle-s0",
  slot: "0",
  state: "quiet",
  tries: 1,
};

export const SLOT = 1000 / 60;
const MAIN_CALLS = 130;
export const DRAWN_CALLS = 350;
export const SHADOW_TRIANGLES = 300_000;
export const START_MS = 5000;
const RACE = 1;
const PARTS = [
  "sim",
  "other",
  "riders",
  "fleet",
  "camera",
  "world",
  "matrices",
  "normal",
  "shadow",
  "main",
  "line",
  "bloom",
  "grade",
];

type Ride = Extract<GpuSample, { side: "B" }>["capture"]["ride"];

export interface Playback {
  readonly interval: (index: number) => number;
  readonly extraCalls: (index: number) => number;
  readonly riders: (index: number) => number;
  readonly world: (index: number) => number;
  readonly shadowTriangles: (index: number) => number;
  readonly longTasks: GpuSample["capture"]["longTasks"];
  readonly discardedAt: number;
  readonly viewport: GpuSample["capture"]["viewport"];
  readonly ride: Ride;
}

const RIDE_STEP = 300;

export const rideOf = (
  programsAt: (index: number) => number,
  texturesAt: (index: number) => number
): Ride =>
  Array.from({ length: 10 }, (_, index) => ({
    created: { programs: programsAt(index), textures: texturesAt(index) },
    frame: 20 + index * RIDE_STEP,
    tick: index * RIDE_STEP,
  }));

export const steady: Playback = {
  discardedAt: -1,
  extraCalls: () => 0,
  interval: () => 16.7,
  longTasks: [],
  ride: rideOf(
    () => 40,
    () => 30
  ),
  riders: () => 0.2,
  shadowTriangles: () => SHADOW_TRIANGLES,
  viewport: { dpr: 2, height: 790, width: 1504 },
  world: () => 0.05,
};

const frameOf = (scenario: Scenario, playback: Playback, index: number) => ({
  calls: [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    MAIN_CALLS + playback.extraCalls(index),
    70,
    135,
    1,
    13,
    1,
  ],
  cpu: [
    1,
    0.2,
    playback.riders(index),
    0.5,
    0.1,
    playback.world(index),
    0.3,
    0.6,
    0.4,
    0.5,
    0.1,
    0.1,
    0.1,
  ],
  discarded: index === playback.discardedAt ? 40 : 0,
  drawnEpoch: 1,
  frame: 100 + index,
  interval: playback.interval(index),
  pixelRatio: 2,
  programs: 40,
  race: RACE,
  sizeEpoch: 1,
  start: START_MS + index * SLOT,
  textures: 30,
  tick: scenario.window.from + index,
  ticks: 1,
  triangles: [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1_000_000,
    playback.shadowTriangles(index),
    600_000,
    1,
    13,
    1,
  ],
});

const sampleOf = (
  scenario: Scenario,
  side: GpuSample["side"],
  pair: number,
  playback: Playback
): GpuSample => {
  const capture = {
    bench: {
      bench: scenario.bench,
      overflowed: false,
      police: scenario.police,
      race: RACE,
      riders: scenario.racers + scenario.police,
    },
    frameRate: FRAME_RATE,
    frames: Array.from({ length: WINDOW_TICKS }, (_, index) =>
      frameOf(scenario, playback, index)
    ),
    longTasks: playback.longTasks,
    parts: PARTS,
    rows: {
      ...validRows(scenario),
      times: Array.from(
        { length: WINDOW_TICKS },
        (_, index) => START_MS + index * SLOT
      ),
    },
    timeOrigin: 0,
    viewport: playback.viewport,
    visibility: "visible",
  };
  const fields = {
    clock: null,
    consoleErrors: 0,
    file: `${scenario.id}-pair${pair}-${side}.json`,
    installed: { tick: 6, visibility: "visible" },
    pair,
    park: QUIET,
    position: side === "A" ? 0 : 1,
    run: side === "A" ? "run-a-s0" : "run-b-s1",
    scenario: scenario.id,
  };
  return side === "A"
    ? { ...fields, capture, side }
    : { ...fields, capture: { ...capture, ride: playback.ride }, side };
};

export const campaign = (
  playbackOf: (
    scenario: Scenario,
    side: GpuSample["side"],
    pair: number
  ) => Playback
): GpuSample[] =>
  scenarios.flatMap((scenario) =>
    Array.from({ length: GPU_PAIRS }, (_, pair) =>
      (["A", "B"] as const).map((side) =>
        sampleOf(scenario, side, pair, playbackOf(scenario, side, pair))
      )
    ).flat()
  );

export const failing = (lines: readonly string[]) =>
  lines.filter((line) => line.startsWith("FAIL"));

export const BAR_FRAMES = BAR_BENCH.to - BAR_BENCH.from;

export const barSampleOf = (
  index: number,
  interval: (frame: number) => number,
  capture: Partial<BarSample["capture"]> = {}
): BarSample => ({
  capture: {
    camera: BAR_BENCH.camera,
    frames: Array.from({ length: BAR_FRAMES }, (_, frame) => ({
      calls: [90],
      cpu: [1],
      discarded: 0,
      drawnEpoch: 0,
      frame,
      interval: interval(frame),
      pixelRatio: 2,
      programs: 40,
      race: 0,
      sizeEpoch: 0,
      start: frame * SLOT,
      textures: 30,
      tick: frame,
      ticks: 1,
      triangles: [600_000],
    })),
    timeOrigin: 0,
    viewport: steady.viewport,
    visibility: "visible",
    ...capture,
  },
  clock: null,
  consoleErrors: 0,
  file: `bar-${index}.json`,
  park: QUIET,
});

export const barOf = (
  interval: (frame: number) => number,
  capture: Partial<BarSample["capture"]> = {}
): BarSample[] =>
  Array.from({ length: BAR_BENCH.samples }, (_, index) =>
    barSampleOf(index, interval, capture)
  );

export const steadyBar = barOf(() => 16.7);

export const scriptedClock = () => {
  const now = { ns: 0n };
  const advance = (ms: number) => {
    now.ns += BigInt(Math.round(ms * 1e6));
  };
  const clock: Clock.Clock = {
    currentTimeMillis: Effect.sync(() => Number(now.ns / 1_000_000n)),
    currentTimeMillisUnsafe: () => Number(now.ns / 1_000_000n),
    currentTimeNanos: Effect.sync(() => now.ns),
    currentTimeNanosUnsafe: () => now.ns,
    monotonicTimeNanos: Effect.sync(() => now.ns),
    monotonicTimeNanosUnsafe: () => now.ns,
    sleep: (duration) =>
      Effect.sync(() => {
        advance(Duration.toMillis(duration));
      }),
  };
  return { advance, clock };
};
