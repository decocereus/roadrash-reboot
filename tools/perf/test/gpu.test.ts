import { readFileSync } from "node:fs";
import path from "node:path";

import { browserHosts } from "@racer/devtools/browser-host";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { budgetsFile } from "../src/budgets.ts";
import { BAR_BENCH } from "../src/gpu-bar.ts";
import type { BarSample } from "../src/gpu-bar.ts";
import { evaluateGpu, GPU_PAIRS } from "../src/gpu-frames.ts";
import { scenarios, WINDOW_TICKS } from "../src/scenarios.ts";
import type { Scenario } from "../src/scenarios.ts";
import {
  BAR_FRAMES,
  barOf,
  barSampleOf,
  campaign,
  DRAWN_CALLS,
  failing,
  rideOf,
  SHADOW_TRIANGLES,
  SLOT,
  START_MS,
  steady,
  steadyBar,
} from "./gpu-fixture.ts";
import type { Playback } from "./gpu-fixture.ts";

const { limits } = Schema.decodeUnknownSync(Schema.fromJsonString(budgetsFile))(
  readFileSync(path.join(import.meta.dirname, "../budgets.json"), "utf-8")
);

const METAL = browserHosts["macos-metal"].perfEnvironment;
const [reference, packRiding] = scenarios;

const isPack = (scenario: Scenario): boolean => scenario.id === packRiding?.id;

const judged = (bar: readonly BarSample[]) =>
  failing(
    evaluateGpu(
      campaign(() => steady),
      bar,
      limits,
      METAL,
      null
    ).lines
  ).join("\n");

describe("bar frame rows", () => {
  it("passes a steady bar", () => {
    expect(judged(steadyBar)).toBe("");
  });

  it("fails when one window's frames slow past the cap", () => {
    const slowOnce = [...steadyBar.slice(1), barSampleOf(0, () => 25)];
    expect(judged(slowOnce)).toContain("bar.frame.interval.p50");
  });

  it("fails when the bar draws more than its budget", () => {
    const heavy = steadyBar.map((sample) => ({
      ...sample,
      capture: {
        ...sample.capture,
        frames: sample.capture.frames.map((frame) => ({
          ...frame,
          triangles: [2_000_000],
        })),
      },
    }));
    expect(judged(heavy)).toContain("bar.render.triangles.max");
  });

  it("refuses a window on another camera", () => {
    expect(judged(barOf(() => 16.7, { camera: "angled" }))).toContain(
      "camera=angled expected=room"
    );
  });

  it("refuses a short or missing capture", () => {
    expect(judged(barOf(() => 16.7, { frames: [] }))).toContain(
      `frames=0 expected>=${BAR_FRAMES}`
    );
    expect(judged([])).toContain(
      `FAIL bar samples=0 expected=${BAR_BENCH.samples}`
    );
  });
});

describe("gpu frame lane", () => {
  it("fails a campaign whose every page left the host's required page", () => {
    const evaluation = evaluateGpu(
      campaign(() => steady),
      steadyBar,
      limits,
      METAL,
      { dpr: 2, height: 773, width: 1512 }
    );
    expect(evaluation.ok).toBeFalsy();
    expect(failing(evaluation.lines).join("\n")).toContain(
      "viewport=1504x790@2 expected=1512x773@2 the host's page"
    );
  });

  it("passes a steady 60 Hz campaign against the owner caps", () => {
    const evaluation = evaluateGpu(
      campaign(() => steady),
      steadyBar,
      limits,
      METAL,
      null
    );
    expect(failing(evaluation.lines)).toStrictEqual([]);
    expect(evaluation.ok).toBeTruthy();
    expect(evaluation.lines).toContain(
      `ok   first-use side=B created no shader program or texture after the first race frame in ${2 * GPU_PAIRS} races of reference-v1 and pack-riding-v1; what only other roads or untriggered effects draw is unchecked`
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
      steadyBar,
      limits,
      METAL,
      null
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
      steadyBar,
      limits,
      METAL,
      null
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
      steadyBar,
      limits,
      METAL,
      null
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
      steadyBar,
      limits,
      METAL,
      null
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
      steadyBar,
      limits,
      METAL,
      null
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
        each.environment === METAL &&
        each.metric === "render.calls.max" &&
        each.scenario === packRiding?.id
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
      steadyBar,
      limits,
      METAL,
      null
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      `FAIL gpu pack-riding-v1 render.calls.max [gpu-helium-metal] observed=${over} calls limit <= ${budget.value} calls A=${DRAWN_CALLS.toPrecision(5)}`,
    ]);
    expect(evaluation.ok).toBeFalsy();
  });

  it("fails a B window whose shadow pass draws more triangles than the committed budget", () => {
    const budget = limits.find(
      (each) =>
        each.environment === METAL &&
        each.metric === "render.shadowTriangles.max" &&
        each.scenario === packRiding?.id
    );
    if (!budget) {
      throw new Error(
        "budgets.json has no pack-riding shadow triangle budget."
      );
    }
    const over = budget.value + 1;
    const evaluation = evaluateGpu(
      campaign((scenario, side) =>
        isPack(scenario) && side === "B"
          ? {
              ...steady,
              shadowTriangles: (index) =>
                index === 9 ? over : SHADOW_TRIANGLES,
            }
          : steady
      ),
      steadyBar,
      limits,
      METAL,
      null
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      `FAIL gpu pack-riding-v1 render.shadowTriangles.max [gpu-helium-metal] observed=${over} triangles limit <= ${budget.value} triangles A=${SHADOW_TRIANGLES.toPrecision(5)}`,
    ]);
    expect(evaluation.ok).toBeFalsy();
  });

  it("fails a B window whose riders take longer than the committed budget", () => {
    const budget = limits.find(
      (each) =>
        each.environment === METAL &&
        each.metric === "riders.cpu.p95" &&
        each.scenario === packRiding?.id
    );
    if (!budget) {
      throw new Error("budgets.json has no pack-riding riders budget.");
    }
    const slow = budget.value * 2;
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) =>
        isPack(scenario) && side === "B" && pair === 0
          ? { ...steady, riders: (index) => (index % 10 === 0 ? slow : 0.2) }
          : steady
      ),
      steadyBar,
      limits,
      METAL,
      null
    );
    expect(
      failing(evaluation.lines).map((line) => line.split(" observed=")[0])
    ).toStrictEqual([
      "FAIL gpu pack-riding-v1 riders.cpu.p95 [gpu-helium-metal]",
    ]);
    expect(evaluation.ok).toBeFalsy();
  });

  it("fails a B race that creates a program or texture after its first frame", () => {
    const compiled = rideOf(
      (index) => (index < 3 ? 40 : 41) + (index < 6 ? 0 : 1),
      () => 30
    );
    const uploaded = rideOf(
      () => 40,
      (index) => (index < 4 ? 30 : 32)
    );
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) => {
        if (side === "B" && isPack(scenario) && pair === 0) {
          return { ...steady, ride: compiled };
        }
        return side === "B" && scenario.id === reference?.id && pair === 3
          ? { ...steady, ride: uploaded }
          : steady;
      }),
      steadyBar,
      limits,
      METAL,
      null
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      "FAIL first-use reference-v1 side=B reference-v1-pair3-B.json textures created after the first race frame: 2 (+2 at frame=1220 tick=1200)",
      "FAIL first-use pack-riding-v1 side=B pack-riding-v1-pair0-B.json programs created after the first race frame: 2 (+1 at frame=920 tick=900, +1 at frame=1820 tick=1800)",
    ]);
    expect(
      evaluation.lines.some((line) => line.startsWith("ok   first-use"))
    ).toBeFalsy();
    expect(evaluation.ok).toBeFalsy();
  });

  it("fails a texture replaced within one frame, which leaves the live count flat", () => {
    const replaced = rideOf(
      () => 40,
      (index) => (index < 8 ? 30 : 31)
    );
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) =>
        isPack(scenario) && side === "B" && pair === 2
          ? { ...steady, ride: replaced }
          : steady
      ),
      steadyBar,
      limits,
      METAL,
      null
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      "FAIL first-use pack-riding-v1 side=B pack-riding-v1-pair2-B.json textures created after the first race frame: 1 (+1 at frame=2420 tick=2400)",
    ]);
    expect(
      evaluation.counts.find(({ scenario }) => scenario === packRiding?.id)
        ?.peaks?.B.textures
    ).toBe(30);
  });

  it("fails a B race whose frames do not start at the countdown", () => {
    const evaluation = evaluateGpu(
      campaign((scenario, side, pair) =>
        isPack(scenario) && side === "B" && pair === 1
          ? { ...steady, ride: [] }
          : steady
      ),
      steadyBar,
      limits,
      METAL,
      null
    );
    expect(failing(evaluation.lines)).toStrictEqual([
      "FAIL first-use pack-riding-v1 side=B pack-riding-v1-pair1-B.json race frames start at tick=none expected=0",
    ]);
  });

  it("judges vimaan against its own rows, never the Mac's", () => {
    const nvidia = browserHosts["linux-nvidia"].perfEnvironment;
    const evaluation = evaluateGpu(
      campaign(() => steady),
      steadyBar,
      limits.filter((limit) => limit.environment === nvidia),
      nvidia,
      null
    );
    expect(failing(evaluation.lines)).toStrictEqual([]);
    expect(evaluation.lines.join("\n")).not.toContain(METAL);
    expect(
      new Set(evaluation.observations.map((each) => each.environment))
    ).toStrictEqual(new Set([nvidia]));
  });
});
