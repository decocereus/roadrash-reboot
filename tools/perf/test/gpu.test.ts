import { readFileSync } from "node:fs";
import path from "node:path";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { budgetsFile } from "../src/budgets.ts";
import { evaluateGpu, FRAME_RATE, GPU_PAIRS } from "../src/gpu-frames.ts";
import type { GpuSample } from "../src/gpu-frames.ts";
import { scenarios, WINDOW_TICKS } from "../src/scenarios.ts";
import type { Scenario } from "../src/scenarios.ts";
import { validRows } from "./red-cases.ts";

const { limits } = Schema.decodeUnknownSync(Schema.fromJsonString(budgetsFile))(
  readFileSync(path.join(import.meta.dirname, "../budgets.json"), "utf-8")
);

const SLOT = 1000 / 60;
const MAIN_CALLS = 130;
const DRAWN_CALLS = 350;
const START_MS = 5000;
const RACE = 1;

type Ride = GpuSample["capture"]["ride"];

interface Playback {
  readonly interval: (index: number) => number;
  readonly extraCalls: (index: number) => number;
  readonly longTasks: GpuSample["capture"]["longTasks"];
  readonly discardedAt: number;
  readonly viewport: GpuSample["capture"]["viewport"];
  readonly ride: Ride;
}

const RIDE_STEP = 300;

const rideOf = (programsAt: (index: number) => number): Ride =>
  Array.from({ length: 10 }, (_, index) => ({
    frame: 20 + index * RIDE_STEP,
    programs: programsAt(index),
    textures: 30,
    tick: index * RIDE_STEP,
  }));

const steady: Playback = {
  discardedAt: -1,
  extraCalls: () => 0,
  interval: () => 16.7,
  longTasks: [],
  ride: rideOf(() => 40),
  viewport: { dpr: 2, height: 790, width: 1504 },
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
  cpu: [1, 0.2, 1, 0.5, 0.1, 0.4, 0.3, 0.6, 0.4, 0.5, 0.1, 0.1, 0.1],
  discarded: index === playback.discardedAt ? 40 : 0,
  drawRung: 0,
  drawnEpoch: 1,
  frame: 100 + index,
  interval: playback.interval(index),
  pixelRatio: scenario.quality.ratio,
  programs: 40,
  race: RACE,
  rung: 0,
  sizeEpoch: 1,
  start: START_MS + index * SLOT,
  textures: 30,
  tick: scenario.window.from + index,
  ticks: 1,
  triangles: [0, 0, 0, 0, 0, 0, 0, 1_000_000, 900_000, 800_000, 1, 13, 1],
});

const sampleOf = (
  scenario: Scenario,
  side: GpuSample["side"],
  pair: number,
  playback: Playback
): GpuSample => ({
  capture: {
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
    ride: playback.ride,
    rows: {
      ...validRows(scenario),
      times: Array.from(
        { length: WINDOW_TICKS },
        (_, index) => START_MS + index * SLOT
      ),
    },
    viewport: playback.viewport,
    visibility: "visible",
  },
  consoleErrors: 0,
  file: `${scenario.id}-pair${pair}-${side}.json`,
  installed: { tick: 6, visibility: "visible" },
  pair,
  position: side === "A" ? 0 : 1,
  run: side === "A" ? "run-a-s0" : "run-b-s1",
  scenario: scenario.id,
  side,
});

const campaign = (
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

const failing = (lines: readonly string[]) =>
  lines.filter((line) => line.startsWith("FAIL"));

const [reference, packRiding] = scenarios;

const isPack = (scenario: Scenario): boolean => scenario.id === packRiding?.id;

describe("gpu frame lane", () => {
  it("passes a steady 60 Hz campaign against the owner caps", () => {
    const evaluation = evaluateGpu(
      campaign(() => steady),
      limits
    );
    expect(failing(evaluation.lines)).toStrictEqual([]);
    expect(evaluation.ok).toBeTruthy();
    expect(evaluation.lines).toContain(
      `ok   first-use side=B created no shader program or texture after the first race frame in ${2 * GPU_PAIRS} races`
    );
    expect(
      evaluation.lines.find((line) =>
        line.includes("pack-riding-v1 frame.interval.p95")
      )
    ).toBe(
      "ok   gpu pack-riding-v1 frame.interval.p95 [gpu-helium-metal] observed=16.700 ms limit <= 20 ms A/B=1 (<= 1.15) A=16.700 (worst of 5 windows; pooled B=16.700 A=16.700)"
    );
  });

  it("fails a window with discarded time and judges none of its frames", () => {
    const evaluation = evaluateGpu(
      campaign((scenario, side) =>
        isPack(scenario) && side === "B"
          ? { ...steady, discardedAt: 9 }
          : steady
      ),
      limits
    );
    const from = packRiding?.window.from ?? 0;
    expect(failing(evaluation.lines)).toContain(
      `FAIL workload pack-riding-v1 side=B pack-riding-v1-pair0-B.json frame=109 tick=${from + 9} discarded=40 ms expected=0`
    );
    expect(failing(evaluation.lines)).toContain(
      "FAIL gpu pack-riding-v1 frame.interval.p50 [gpu-helium-metal] missing measurement"
    );
    expect(
      evaluation.observations.some((each) => each.scenario === "pack-riding-v1")
    ).toBeFalsy();
    expect(evaluation.ok).toBeFalsy();
  });

  it("counts long tasks inside the window and clips their blocking time", () => {
    const end = START_MS + (WINDOW_TICKS - 1) * SLOT;
    const evaluation = evaluateGpu(
      campaign((scenario, side) =>
        scenario.id === reference?.id && side === "B"
          ? {
              ...steady,
              longTasks: [
                { duration: 300, name: "self", start: 100 },
                { duration: 80, name: "self", start: end - 60 },
              ],
            }
          : steady
      ),
      limits
    );
    const blocking = evaluation.observations.find(
      (each) =>
        each.scenario === "reference-v1" &&
        each.metric === "main.longTask.blockingMs"
    );
    expect(blocking?.runs.b.map((each) => Math.round(each))).toStrictEqual(
      Array.from({ length: GPU_PAIRS }, () => 10)
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      "FAIL gpu reference-v1 main.longTask.count [gpu-helium-metal] observed=5 tasks limit <= 0 tasks A=0.0000",
      "FAIL gpu reference-v1 main.longTask.blockingMs [gpu-helium-metal] observed=50 ms limit <= 0 ms A=0.0000",
    ]);
  });

  it("fails slower B frames on the cap, the paired ratio and missed slots", () => {
    const slower: Playback = {
      ...steady,
      interval: (index) => (index % 10 === 0 ? 33.4 : 16.7),
    };
    const evaluation = evaluateGpu(
      campaign((scenario, side) =>
        isPack(scenario) && side === "B" ? slower : steady
      ),
      limits
    );
    expect(
      failing(evaluation.lines).map((line) => line.split(" observed=")[0])
    ).toStrictEqual([
      "FAIL gpu pack-riding-v1 frame.interval.p95 [gpu-helium-metal]",
      "FAIL gpu pack-riding-v1 frame.interval.p99 [gpu-helium-metal]",
      "FAIL gpu pack-riding-v1 frame.missedFraction [gpu-helium-metal]",
    ]);
    expect(
      evaluation.lines.find((line) =>
        line.includes("pack-riding-v1 frame.interval.p95")
      )
    ).toContain("A/B=2 (<= 1.15)");
  });

  it("fails one bad B window that four steady windows would hide", () => {
    const stalled: Playback = {
      ...steady,
      interval: (index) => (index >= 200 && index < 220 ? 33.4 : 16.7),
    };
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) =>
        isPack(scenario) && side === "B" && pair === 0 ? stalled : steady
      ),
      limits
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      "FAIL gpu pack-riding-v1 frame.interval.p99 [gpu-helium-metal] observed=33.400 ms limit <= 33.334 ms A/B=1 (<= 1.2) A=16.700 (worst of 5 windows; pooled B=16.700 A=16.700)",
      "FAIL gpu pack-riding-v1 frame.missedFraction [gpu-helium-metal] observed=0.032206 share limit <= 0.010000 share A=0.0000 (worst of 5 windows; pooled B=0.0066116 A=0.0000)",
    ]);
    expect(evaluation.ok).toBeFalsy();
  });

  it("fails a campaign whose windows differ in size", () => {
    const evaluation = evaluateGpu(
      campaign((scenario, side) =>
        isPack(scenario) && side === "B"
          ? { ...steady, viewport: { ...steady.viewport, height: 836 } }
          : steady
      ),
      limits
    );
    expect(failing(evaluation.lines)).toContain(
      "FAIL gpu pack-riding-v1 side=B pack-riding-v1-pair0-B.json viewport=1504x836@2 expected=1504x790@2 like pack-riding-v1-pair0-A.json"
    );
    expect(failing(evaluation.lines)).toContain(
      "FAIL gpu pack-riding-v1 frame.interval.p95 [gpu-helium-metal] missing measurement"
    );
    expect(evaluation.ok).toBeFalsy();
  });

  it("fails a pack window that draws more calls than the committed budget", () => {
    const budget = limits.find(
      (each) =>
        each.metric === "render.calls.max" && each.scenario === packRiding?.id
    );
    if (!budget) {
      throw new Error("budgets.json has no pack-riding draw-call budget.");
    }
    const over = budget.value + 1;
    const evaluation = evaluateGpu(
      campaign((scenario, side) =>
        isPack(scenario) && side === "B"
          ? {
              ...steady,
              extraCalls: (index) => (index === 9 ? over - DRAWN_CALLS : 0),
            }
          : steady
      ),
      limits
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      `FAIL gpu pack-riding-v1 render.calls.max [gpu-helium-metal] observed=${over} calls limit <= ${budget.value} calls A=${DRAWN_CALLS.toPrecision(5)}`,
    ]);
    expect(evaluation.ok).toBeFalsy();
  });

  it("fails a B race that creates a program or texture after its first frame", () => {
    const replaced = rideOf((index) => [40, 40, 39, 40][index] ?? 41);
    const uploaded = steady.ride.map((frame, index) =>
      index >= 4 ? { ...frame, textures: 32 } : frame
    );
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) => {
        if (side === "A" || (isPack(scenario) && pair === 0)) {
          return { ...steady, ride: replaced };
        }
        return scenario.id === reference?.id && pair === 3
          ? { ...steady, ride: uploaded }
          : steady;
      }),
      limits
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      "FAIL first-use reference-v1 side=B reference-v1-pair3-B.json textures created after warm-up (30 on the first race frame): +2 at frame=1220 tick=1200",
      "FAIL first-use pack-riding-v1 side=B pack-riding-v1-pair0-B.json programs created after warm-up (40 on the first race frame): +1 at frame=920 tick=900, +1 at frame=1220 tick=1200",
    ]);
    expect(
      evaluation.lines.some((line) => line.startsWith("ok   first-use"))
    ).toBeFalsy();
    expect(evaluation.ok).toBeFalsy();
  });

  it("fails a B race whose frames do not start at the countdown", () => {
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) =>
        isPack(scenario) && side === "B" && pair === 1
          ? { ...steady, ride: [] }
          : steady
      ),
      limits
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      "FAIL first-use pack-riding-v1 side=B pack-riding-v1-pair1-B.json race frames start at tick=none expected=0",
    ]);
  });
});
