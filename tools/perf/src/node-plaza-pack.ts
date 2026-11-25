import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import { roadLifeRace, roadLifeSetup } from "@racer/career/bench";
import { UsageError } from "@racer/devtools/usage-error";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceView } from "@racer/sim/race-view";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { runtimeOf } from "./node.ts";
import { PLAZA_PACK } from "./plaza-pack.ts";
import { digestOf } from "./result.ts";
import { eitherSideFrame, WINDOW_TICKS } from "./scenarios.ts";

const LEAD_IN_LIMIT = 20_000;

const ridersInPlaza = (view: RaceView): number => {
  let count = 0;
  for (const rider of view.riders) {
    if (
      rider.finishTick < 0 &&
      rider.mode !== "wrecked" &&
      rider.mode !== "busted" &&
      rider.s >= PLAZA_PACK.from &&
      rider.s <= PLAZA_PACK.to
    ) {
      count += 1;
    }
  }
  return count;
};

const measuredWindow = () => {
  const setup = roadLifeSetup();
  const run = createRaceRun({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
  });
  while (
    ridersInPlaza(run.view) < PLAZA_PACK.startRiders &&
    run.view.tick < LEAD_IN_LIMIT
  ) {
    run.step(eitherSideFrame);
  }
  const startTick = run.view.tick;
  const durations = new Float64Array(WINDOW_TICKS);
  let fewestRiders = Number.POSITIVE_INFINITY;
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    const started = performance.now();
    run.step(eitherSideFrame);
    durations[index] = performance.now() - started;
    fewestRiders = Math.min(fewestRiders, ridersInPlaza(run.view));
  }
  return {
    durations: [...durations],
    plazaPack: { fewestRiders, startTick },
  };
};

const usage =
  "Usage: node tools/perf/plaza-pack.ts --scenario <id> --out <file>";

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: { out: { type: "string" }, scenario: { type: "string" } },
      }).values,
  });

export const plazaPackChild = Effect.fn("node.plazaPack")(
  function* plazaPackChild(args: readonly string[]) {
    const fs = yield* FileSystem.FileSystem;
    const values = yield* readOptions(args);
    if (values.scenario !== PLAZA_PACK.id || values.out === undefined) {
      return yield* new UsageError({ message: usage });
    }
    measuredWindow();
    const record = {
      ...measuredWindow(),
      runtime: runtimeOf(),
      scenario: PLAZA_PACK.id,
      scenarioHash: digestOf({ ...roadLifeRace, plaza: PLAZA_PACK }),
      task: "plazaPack",
    };
    return yield* fs.writeFileString(values.out, JSON.stringify(record));
  }
);
