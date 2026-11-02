import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import { roadLifeRace, roadLifeSetup } from "@racer/career/bench";
import { UsageError } from "@racer/devtools/usage-error";
import { onRoad } from "@racer/sim/cross-traffic";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceView } from "@racer/sim/race-view";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { runtimeOf } from "./node.ts";
import { digestOf } from "./result.ts";
import { ROAD_LIFE } from "./road-life.ts";
import { eitherSideFrame, WINDOW_TICKS } from "./scenarios.ts";

const racersNear = (view: RaceView, crossingS: readonly number[]): number => {
  let most = 0;
  for (const s of crossingS) {
    let near = 0;
    for (const rider of view.riders) {
      if (
        rider.profile.role === "racer" &&
        Math.abs(rider.s - s) < ROAD_LIFE.nearMetres
      ) {
        near += 1;
      }
    }
    most = Math.max(most, near);
  }
  return most;
};

const crossCarsOnRoad = (view: RaceView): number => {
  let count = 0;
  for (const car of view.crossCars) {
    if (onRoad(car)) {
      count += 1;
    }
  }
  return count;
};

const walkersOnRoad = (view: RaceView): number => {
  let count = 0;
  for (const pedestrian of view.pedestrians) {
    if (pedestrian.mode === "walking") {
      count += 1;
    }
  }
  return count;
};

const measuredWindow = () => {
  const setup = roadLifeSetup();
  const crossingS = setup.track.crossings
    .filter((crossing) => crossing.road)
    .map((crossing) => crossing.s);
  const run = createRaceRun({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
  });
  while (run.view.tick < ROAD_LIFE.from - 1) {
    run.step(eitherSideFrame);
  }
  const durations = new Float64Array(WINDOW_TICKS);
  let fewestCrossCars = Number.POSITIVE_INFINITY;
  let fewestWalkers = Number.POSITIVE_INFINITY;
  let mostRacersAtCrossing = 0;
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    const started = performance.now();
    run.step(eitherSideFrame);
    durations[index] = performance.now() - started;
    fewestCrossCars = Math.min(fewestCrossCars, crossCarsOnRoad(run.view));
    fewestWalkers = Math.min(fewestWalkers, walkersOnRoad(run.view));
    mostRacersAtCrossing = Math.max(
      mostRacersAtCrossing,
      racersNear(run.view, crossingS)
    );
  }
  return {
    durations: [...durations],
    roadLife: { fewestCrossCars, fewestWalkers, mostRacersAtCrossing },
  };
};

const usage =
  "Usage: node tools/perf/road-life.ts --scenario <id> --out <file>";

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: { out: { type: "string" }, scenario: { type: "string" } },
      }).values,
  });

export const roadLifeChild = Effect.fn("node.roadLife")(function* roadLifeChild(
  args: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const values = yield* readOptions(args);
  if (values.scenario !== ROAD_LIFE.id || values.out === undefined) {
    return yield* new UsageError({ message: usage });
  }
  measuredWindow();
  const record = {
    ...measuredWindow(),
    runtime: runtimeOf(),
    scenario: ROAD_LIFE.id,
    scenarioHash: digestOf(roadLifeRace),
    task: "roadLife",
  };
  return yield* fs.writeFileString(values.out, JSON.stringify(record));
});
