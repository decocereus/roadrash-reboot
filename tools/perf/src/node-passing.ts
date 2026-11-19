import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import { roadLifeRace, roadLifeSetup } from "@racer/career/bench";
import { UsageError } from "@racer/devtools/usage-error";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER } from "@racer/sim/state";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  hearPassing,
  passingVoices,
} from "../../../apps/web/src/sound/passing.ts";
import { runtimeOf } from "./node.ts";
import { PASSING_BENCH } from "./passing-bench.ts";
import { digestOf } from "./result.ts";
import { eitherSideFrame, WINDOW_TICKS } from "./scenarios.ts";

const measuredWindow = () => {
  const setup = roadLifeSetup();
  const run = createRaceRun({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
  });
  while (run.view.tick < PASSING_BENCH.from - 1) {
    run.step(eitherSideFrame);
  }
  const voices = passingVoices();
  const durations = new Float64Array(WINDOW_TICKS);
  let fewestHeard = Number.POSITIVE_INFINITY;
  let mostHeard = 0;
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    run.step(eitherSideFrame);
    const started = performance.now();
    for (let repeat = 0; repeat < PASSING_BENCH.repeats; repeat += 1) {
      hearPassing(run.view, PLAYER_RIDER, voices);
    }
    durations[index] = (performance.now() - started) / PASSING_BENCH.repeats;
    let heard = 0;
    for (const voice of voices) {
      if (voice.gain > 0) {
        heard += 1;
      }
    }
    fewestHeard = Math.min(fewestHeard, heard);
    mostHeard = Math.max(mostHeard, heard);
  }
  return {
    durations: [...durations],
    passing: { fewestHeard, mostHeard },
  };
};

const usage = "Usage: node tools/perf/passing.ts --scenario <id> --out <file>";

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: { out: { type: "string" }, scenario: { type: "string" } },
      }).values,
  });

export const passingChild = Effect.fn("node.passing")(function* passingChild(
  args: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const values = yield* readOptions(args);
  if (values.scenario !== PASSING_BENCH.id || values.out === undefined) {
    return yield* new UsageError({ message: usage });
  }
  measuredWindow();
  const record = {
    ...measuredWindow(),
    runtime: runtimeOf(),
    scenario: PASSING_BENCH.id,
    scenarioHash: digestOf({ bench: PASSING_BENCH, race: roadLifeRace }),
    task: "passing",
  };
  return yield* fs.writeFileString(values.out, JSON.stringify(record));
});
