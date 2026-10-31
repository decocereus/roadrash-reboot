import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import { observeWorkload, workloadColumns } from "@racer/sim/bench-workload";
import { createRace, stepRace } from "@racer/sim/race";
import {
  hashRace,
  restoreInto,
  snapshotCapacity,
  writeSnapshot,
} from "@racer/sim/snapshot";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { setupDigest } from "@racer/sim/snapshot-setup";
import type { InputFrame } from "@racer/sim/state";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { runtimeOf } from "./node.ts";
import {
  benchRun,
  benchStart,
  rowsOf,
  scenarioHash,
  scenarios,
  WINDOW_TICKS,
} from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";

const prepareSnapshots = (scenario: Scenario) => {
  const setup = benchStart(scenario.bench);
  const run = benchRun(scenario.bench);
  const spare = createRace(setup);
  const frame: InputFrame = new Map();
  while (run.view.tick < scenario.window.from - 1) {
    run.step();
  }
  while (spare.tick < scenario.window.from) {
    stepRace(spare, setup.track, frame);
  }
  const police = run.view.riders.filter(
    (rider) => rider.profile.role === "police"
  ).length;
  const columns = workloadColumns(WINDOW_TICKS);
  const words = new Uint32Array(HASH_WORDS);
  const digest = setupDigest(run.view, setup.track);
  const bytes = new Float64Array(WINDOW_TICKS);
  const hash = new Float64Array(WINDOW_TICKS);
  const restore = new Float64Array(WINDOW_TICKS);
  const write = new Float64Array(WINDOW_TICKS);
  let out = new DataView(new ArrayBuffer(snapshotCapacity(run.view)));
  return {
    measure: () => {
      for (let index = 0; index < WINDOW_TICKS; index += 1) {
        run.step();
        stepRace(spare, setup.track, frame);
        const needed = snapshotCapacity(run.view);
        if (out.byteLength < needed) {
          out = new DataView(new ArrayBuffer(needed));
        }
        const atWrite = performance.now();
        const written = writeSnapshot(run.view, digest, out);
        write[index] = performance.now() - atWrite;
        bytes[index] = written;
        const taken = new DataView(out.buffer, 0, written);
        const atRestore = performance.now();
        restoreInto(spare, digest, taken);
        restore[index] = performance.now() - atRestore;
        const atHash = performance.now();
        hashRace(run.view, digest, out, words);
        hash[index] = performance.now() - atHash;
        observeWorkload(run.view, columns, index);
      }
    },
    police,
    racers: run.view.riders.length - police,
    rows: () => rowsOf(columns, WINDOW_TICKS),
    snapshot: () => ({
      bytes: [...bytes],
      hash: [...hash],
      restore: [...restore],
      write: [...write],
    }),
  };
};

const snapshotWindow = (scenario: Scenario) => {
  prepareSnapshots(scenario).measure();
  const prepared = prepareSnapshots(scenario);
  prepared.measure();
  return {
    police: prepared.police,
    racers: prepared.racers,
    rows: prepared.rows(),
    snapshot: prepared.snapshot(),
  };
};

const usage = "Usage: node tools/perf/snapshot.ts --scenario <id> --out <file>";

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: { out: { type: "string" }, scenario: { type: "string" } },
      }).values,
  });

export const snapshotChild = Effect.fn("node.snapshot")(function* snapshotChild(
  args: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const values = yield* readOptions(args);
  const scenario = scenarios.find((each) => each.id === values.scenario);
  if (!scenario || values.out === undefined) {
    return yield* new UsageError({ message: usage });
  }
  const record = {
    ...snapshotWindow(scenario),
    runtime: runtimeOf(),
    scenario: scenario.id,
    scenarioHash: scenarioHash(scenario),
    task: "snapshot",
  };
  return yield* fs.writeFileString(values.out, JSON.stringify(record));
});
