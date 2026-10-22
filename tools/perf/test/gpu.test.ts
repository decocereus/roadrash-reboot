import { describe, expect, it } from "vitest";

import { evaluateGpu, FRAME_RATE, GPU_PAIRS } from "../src/gpu-frames.ts";
import type { GpuSample } from "../src/gpu-frames.ts";
import { scenarios, WINDOW_TICKS } from "../src/scenarios.ts";
import type { Scenario } from "../src/scenarios.ts";
import { validRows } from "./red-cases.ts";

const SLOT = 1000 / 60;
const START_MS = 5000;
const RACE = 1;

interface Playback {
  readonly interval: (index: number) => number;
  readonly longTasks: GpuSample["capture"]["longTasks"];
  readonly discardedAt: number;
  readonly viewport: GpuSample["capture"]["viewport"];
}

const steady: Playback = {
  discardedAt: -1,
  interval: () => 16.7,
  longTasks: [],
  viewport: { dpr: 2, height: 790, width: 1504 },
};

const frameOf = (scenario: Scenario, playback: Playback, index: number) => ({
  calls: [0, 0, 0, 0, 0, 0, 0, 130, 70, 135, 1, 13, 1],
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
  triangles: [0, 0, 0, 0, 0, 0, 0, 1_000_000, 900_000, 1_000_000, 1, 13, 1],
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
  playbackOf: (scenario: Scenario, side: GpuSample["side"]) => Playback
): GpuSample[] =>
  scenarios.flatMap((scenario) =>
    Array.from({ length: GPU_PAIRS }, (_, pair) =>
      (["A", "B"] as const).map((side) =>
        sampleOf(scenario, side, pair, playbackOf(scenario, side))
      )
    ).flat()
  );

const failing = (lines: readonly string[]) =>
  lines.filter((line) => line.startsWith("FAIL"));

const [reference, packRiding] = scenarios;

const isPack = (scenario: Scenario): boolean => scenario.id === packRiding?.id;

describe("gpu frame lane", () => {
  it("passes a steady 60 Hz campaign against the owner caps", () => {
    const evaluation = evaluateGpu(campaign(() => steady));
    expect(failing(evaluation.lines)).toStrictEqual([]);
    expect(evaluation.ok).toBeTruthy();
    expect(
      evaluation.lines.find((line) =>
        line.includes("pack-riding-v1 frame.interval.p95")
      )
    ).toBe(
      "ok   gpu pack-riding-v1 frame.interval.p95 [gpu-helium-metal] observed=16.700 ms limit <= 20 ms A/B=1 (<= 1.15) A=16.700"
    );
  });

  it("fails a window with discarded time and judges none of its frames", () => {
    const evaluation = evaluateGpu(
      campaign((scenario, side) =>
        isPack(scenario) && side === "B"
          ? { ...steady, discardedAt: 9 }
          : steady
      )
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
      )
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
      )
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

  it("fails a campaign whose windows differ in size", () => {
    const evaluation = evaluateGpu(
      campaign((scenario, side) =>
        isPack(scenario) && side === "B"
          ? { ...steady, viewport: { ...steady.viewport, height: 836 } }
          : steady
      )
    );
    expect(failing(evaluation.lines)).toContain(
      "FAIL gpu pack-riding-v1 side=B pack-riding-v1-pair0-B.json viewport=1504x836@2 expected=1504x790@2 like pack-riding-v1-pair0-A.json"
    );
    expect(failing(evaluation.lines)).toContain(
      "FAIL gpu pack-riding-v1 frame.interval.p95 [gpu-helium-metal] missing measurement"
    );
    expect(evaluation.ok).toBeFalsy();
  });
});
