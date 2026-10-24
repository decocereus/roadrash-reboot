import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vitest";

import type { Budgets } from "../src/budgets.ts";
import { accountBuild } from "../src/build.ts";
import type { BuildRecord } from "../src/build.ts";
import { evaluateGate } from "../src/evaluate.ts";
import type { Samples } from "../src/evaluate.ts";
import { scenarios, WINDOW_TICKS } from "../src/scenarios.ts";
import { fixtureBuild, plainFixture } from "./fixture-build.ts";
import type { FixtureOptions } from "./fixture-build.ts";
import {
  ALLOCATED_PER_TICK,
  BIKE_BYTES,
  samplesOf,
  steadyLanes,
  syntheticBudgets,
  syntheticBuild,
  syntheticLane,
  validRows,
} from "./red-cases.ts";

const GATE = path.join(import.meta.dirname, "../gate.ts");

const made: string[] = [];

const scratch = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-perf-red-"));
  made.push(dir);
  return dir;
};

const throughEntry = (samples: Samples, budgets: Budgets) => {
  const dir = scratch();
  const samplesFile = path.join(dir, "samples.json");
  const budgetsFile = path.join(dir, "budgets.json");
  writeFileSync(samplesFile, JSON.stringify(samples));
  writeFileSync(budgetsFile, JSON.stringify(budgets));
  const ran = spawnSync(
    process.execPath,
    [GATE, "--evaluate", samplesFile, "--budgets", budgetsFile],
    { encoding: "utf-8" }
  );
  return { status: ran.status, stdout: ran.stdout };
};

const accounted = async (
  name: BuildRecord["side"],
  options: FixtureOptions
): Promise<BuildRecord> => {
  const dir = scratch();
  const { out, side } = fixtureBuild(dir, name, options);
  return await Effect.runPromise(
    accountBuild(side, out, path.join(dir, "evidence"), 0).pipe(
      Effect.provide(NodeFileSystem.layer)
    )
  );
};

const steady = { runner: 1, sim: 1 };
const [reference, packRiding] = scenarios;
const middle = Math.floor(WINDOW_TICKS / 2);

const failing = (lines: readonly string[]) =>
  lines.filter((line) => line.startsWith("FAIL"));

describe("perf gate red cases", () => {
  afterEach(() => {
    for (const dir of made.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  const build = {
    A: syntheticBuild("A", BIKE_BYTES),
    B: syntheticBuild("B", BIKE_BYTES),
  };
  const budgets = syntheticBudgets(build);

  it("passes an unchanged synthetic A/B", () => {
    const evaluation = evaluateGate(
      samplesOf("steady", steadyLanes(steady), build),
      budgets
    );
    expect(failing(evaluation.lines)).toStrictEqual([]);
    expect(evaluation.ok).toBeTruthy();
  });

  it("fails a thinner or thrown pack window and judges none of its timings", () => {
    if (!(reference && packRiding)) {
      throw new Error("The registry lost a scenario.");
    }
    const rows = validRows(packRiding);
    const thinner = {
      ...rows,
      ahead: rows.ahead.map((each, index) => (index === middle ? 10 : each)),
    };
    const thrown = {
      ...rows,
      modes: rows.modes.map((each, index) =>
        index === middle ? "thrown" : each
      ),
    };
    const tick = packRiding.window.from + middle;
    for (const [bad, shown] of [
      [thinner, `tick=${tick} ahead=10 expected=11..13 rivals`],
      [thrown, `tick=${tick} mode=thrown expected=riding`],
    ] as const) {
      const samples = samplesOf(
        "workload",
        [
          syntheticLane(reference, steady),
          syntheticLane(packRiding, steady, bad),
        ],
        build
      );
      const evaluation = evaluateGate(samples, budgets);
      expect(evaluation.lines).toContain(
        `FAIL workload pack-riding-v1 side=B validate-B.json ${shown}`
      );
      expect(evaluation.lines).toContain(
        "FAIL node pack-riding-v1 sim.tick.p95 [node-test-x] missing measurement"
      );
      expect(
        evaluation.observations.some(
          (each) => each.scenario === "pack-riding-v1"
        )
      ).toBeFalsy();
      const entry = throughEntry(samples, budgets);
      expect(entry.status).toBe(1);
      expect(entry.stdout).toContain(`FAIL workload pack-riding-v1`);
    }
  });

  it("normalizes a slower runner and leaves bytes and allocations raw", () => {
    const runnerOnly = samplesOf(
      "runner",
      steadyLanes({ runner: 1.6, sim: 1 }),
      build
    );
    const passed = evaluateGate(runnerOnly, budgets);
    expect(failing(passed.lines)).toStrictEqual([]);
    const allocated = passed.observations.filter(
      (each) => each.metric === "sim.allocatedBytesPerTick"
    );
    expect(allocated.map((each) => each.value)).toStrictEqual([
      ALLOCATED_PER_TICK,
      ALLOCATED_PER_TICK,
    ]);
    expect(
      passed.observations
        .filter((each) => each.lane === "build")
        .map((each) => each.value)
    ).toStrictEqual(
      evaluateGate(samplesOf("steady", steadyLanes(steady), build), budgets)
        .observations.filter((each) => each.lane === "build")
        .map((each) => each.value)
    );
    expect(throughEntry(runnerOnly, budgets).status).toBe(0);
  });

  it("fails a slower sim on the same slower runner", () => {
    const slowerSim = samplesOf(
      "sim",
      steadyLanes({ runner: 1.6, sim: 1.3 }),
      build
    );
    const failed = evaluateGate(slowerSim, budgets);
    expect(
      failing(failed.lines).map((line) => line.split(" observed=")[0])
    ).toStrictEqual(
      ["sim.ticksPerSecond", "sim.tick.p95", "sim.tick.p99"].flatMap((metric) =>
        scenarios.map(
          (scenario) => `FAIL node ${scenario.id} ${metric} [node-test-x]`
        )
      )
    );
    expect(
      failed.lines.find((line) => line.includes("reference-v1 sim.tick.p95"))
    ).toContain("A/B=1.3000 (<= 1.15)");
    const entry = throughEntry(slowerSim, budgets);
    expect(entry.status).toBe(1);
    expect(entry.stdout).toContain("scale=1.600");
  });

  it("fails a GLB that grows by one byte through the real byte accounting", async () => {
    const before = await accounted("A", plainFixture);
    const after = await accounted("B", { ...plainFixture, bikeExtraBytes: 1 });
    const approved = syntheticBudgets({ A: before, B: before });
    const samples = samplesOf("glb", steadyLanes(steady), {
      A: before,
      B: after,
    });
    expect(failing(evaluateGate(samples, approved).lines)).toStrictEqual([
      "FAIL build - assets.glb.bike [build] observed=65 B limit <= 64 B delta=+1 B A=64",
      "FAIL build - assets.glb.total [build] observed=577 B limit <= 576 B delta=+1 B A=576",
    ]);
    const entry = throughEntry(samples, approved);
    expect(entry.status).toBe(1);
    expect(entry.stdout).toContain("FAIL build - assets.glb.total");
  });

  it("measures a model that side A predates without failing side A's inventory", async () => {
    const before = await accounted("A", {
      ...plainFixture,
      missingGlb: "seraph",
    });
    const after = await accounted("B", plainFixture);
    const approved = syntheticBudgets({ A: after, B: after });
    const samples = samplesOf("glb", steadyLanes(steady), {
      A: before,
      B: after,
    });
    expect(failing(evaluateGate(samples, approved).lines)).toStrictEqual([]);
    const unlisted = await accounted("B", {
      ...plainFixture,
      missingGlb: "seraph",
    });
    expect(unlisted.problems).toContain(
      "GLB inventory is bike, car, ghost, oni, rider_a, rider_b, rider_c, van; expected bike, car, ghost, oni, rider_a, rider_b, rider_c, seraph, van"
    );
  });

  it("fails a server module that the Worker imports dynamically when it grows", async () => {
    const before = await accounted("A", plainFixture);
    const after = await accounted("B", {
      ...plainFixture,
      routerExtraBytes: 4097,
    });
    const approved = syntheticBudgets({ A: before, B: before });
    const samples = samplesOf("worker", steadyLanes(steady), {
      A: before,
      B: after,
    });
    expect(failing(evaluateGate(samples, approved).lines)).toStrictEqual([
      "FAIL build - bytes.worker.raw [build] observed=8797 B limit <= 8796 B delta=+4097 B A=4700 files=3 new=[]",
    ]);
    const entry = throughEntry(samples, approved);
    expect(entry.status).toBe(1);
    expect(entry.stdout).toContain("FAIL build - bytes.worker.raw");
    expect(after.closures.worker.files).toStrictEqual([
      "server/assets/limits.js",
      "server/assets/router.js",
      "server/server.js",
    ]);
  });

  it("counts shared route files once", async () => {
    const record = await accounted("A", plainFixture);
    expect(record.problems).toStrictEqual([]);
    expect(record.closures.root.files).toStrictEqual([
      "client/assets/invoice.js",
      "client/assets/main.js",
      "client/assets/routes.js",
      "client/assets/shared.js",
      "client/assets/styles.css",
    ]);
    expect({
      gameIncremental: record.closures.gameIncremental.raw,
      kit: record.closures.kit.raw,
      root: record.closures.root.raw,
      uploaderIncremental: record.closures.uploaderIncremental.raw,
      worker: record.closures.worker.raw,
    }).toStrictEqual({
      gameIncremental: 5000 + 300 + 9 * 64,
      kit: 8700,
      root: 9000,
      uploaderIncremental: 400,
      worker: 3000 + 200 + 1500,
    });
  });

  it("fails a route closure with a missing edge", async () => {
    const record = await accounted("A", plainFixture);
    const broken = await accounted("B", { ...plainFixture, missingEdge: true });
    expect(broken.problems).toStrictEqual([
      "The client manifest has no chunk _missing",
    ]);
    const evaluation = evaluateGate(
      samplesOf("edge", steadyLanes(steady), { A: record, B: broken }),
      syntheticBudgets({ A: record, B: record })
    );
    expect(evaluation.ok).toBeFalsy();
    expect(evaluation.lines).toContain(
      "FAIL bytes side=B The client manifest has no chunk _missing"
    );
  });
});
