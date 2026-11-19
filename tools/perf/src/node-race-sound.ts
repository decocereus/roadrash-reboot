import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import { roadLifeRace, roadLifeSetup } from "@racer/career/bench";
import { UsageError } from "@racer/devtools/usage-error";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, riderOf, TICK_SECONDS } from "@racer/sim/state";
import { engineCharacters } from "@racer/web/sound/characters";
import { engineControl } from "@racer/web/sound/engine-control";
import type { Param } from "@racer/web/sound/glide";
import { PASSING_VOICES } from "@racer/web/sound/passing";
import {
  bandControl,
  createRaceMix,
  hearMix,
  passingOut,
  rideFrom,
  rideMix,
  stillRide,
} from "@racer/web/sound/race-mix";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { runtimeOf } from "./node.ts";
import { RACE_SOUND_BENCH } from "./race-sound-bench.ts";
import { digestOf } from "./result.ts";
import { eitherSideFrame, WINDOW_TICKS } from "./scenarios.ts";

const recording = () => {
  let scheduled = 0;
  const param: Param = {
    cancelScheduledValues: () => {
      scheduled += 1;
      return param;
    },
    linearRampToValueAtTime: () => {
      scheduled += 1;
      return param;
    },
    setTargetAtTime: () => {
      scheduled += 1;
      return param;
    },
    setValueAtTime: () => {
      scheduled += 1;
      return param;
    },
  };
  return { param, scheduled: () => scheduled };
};

const measuredWindow = () => {
  const setup = roadLifeSetup();
  const run = createRaceRun({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
  });
  while (run.view.tick < RACE_SOUND_BENCH.from - 1) {
    run.step(eitherSideFrame);
  }
  const { param, scheduled } = recording();
  const mix = createRaceMix();
  mix.engine = engineControl(engineCharacters[setup.player.bike.bikeClass], {
    fifth: param,
    growl: param,
    level: param,
    saw: param,
    shift: param,
    square: param,
    tone: param,
  });
  mix.wind = bandControl({ gain: param, tone: param }, 0.15);
  mix.scrub = bandControl({ gain: param, tone: param }, 0.06);
  for (let voice = 0; voice < PASSING_VOICES; voice += 1) {
    mix.outs.push(
      passingOut({
        gate: param,
        high: param,
        level: param,
        low: param,
        mix: param,
        pan: param,
        tone: param,
      })
    );
  }
  const ride = stillRide();
  const durations = new Float64Array(WINDOW_TICKS);
  let fewestHeard = Number.POSITIVE_INFINITY;
  let mostHeard = 0;
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    run.step(eitherSideFrame);
    const now = run.view.tick * TICK_SECONDS;
    const me = riderOf(run.view.riders, PLAYER_RIDER);
    const started = performance.now();
    if (me) {
      rideFrom(ride, me, me.mode === "riding", true);
    }
    rideMix(mix, ride, now);
    hearMix(mix, run.view, PLAYER_RIDER, now);
    durations[index] = performance.now() - started;
    let heard = 0;
    for (const voice of mix.passing) {
      if (voice.gain > 0) {
        heard += 1;
      }
    }
    fewestHeard = Math.min(fewestHeard, heard);
    mostHeard = Math.max(mostHeard, heard);
  }
  return {
    durations: [...durations],
    raceSound: { fewestHeard, mostHeard, scheduled: scheduled() },
  };
};

const usage =
  "Usage: node tools/perf/race-sound.ts --scenario <id> --out <file>";

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: { out: { type: "string" }, scenario: { type: "string" } },
      }).values,
  });

export const raceSoundChild = Effect.fn("node.raceSound")(
  function* raceSoundChild(args: readonly string[]) {
    const fs = yield* FileSystem.FileSystem;
    const values = yield* readOptions(args);
    if (values.scenario !== RACE_SOUND_BENCH.id || values.out === undefined) {
      return yield* new UsageError({ message: usage });
    }
    measuredWindow();
    const record = {
      ...measuredWindow(),
      runtime: runtimeOf(),
      scenario: RACE_SOUND_BENCH.id,
      scenarioHash: digestOf({ bench: RACE_SOUND_BENCH, race: roadLifeRace }),
      task: "raceSound",
    };
    return yield* fs.writeFileString(values.out, JSON.stringify(record));
  }
);
