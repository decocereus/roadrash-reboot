import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import type { RiderView } from "@racer/sim/race-view";
import type { RaceSetup } from "@racer/sim/state";
import type { Track } from "@racer/track/track";

import { createFleet } from "./actors.ts";
import type { Fleet } from "./actors.ts";
import type { Assets } from "./assets.ts";
import type { ChaseCamera } from "./chase-camera.ts";
import type { DevRide } from "./dev-ride.ts";
import type { Pipeline } from "./post.ts";
import { createPreparation } from "./preparation.ts";
import type { Clock, PrepareOutcome } from "./preparation.ts";
import type { Quality } from "./quality-ladder.ts";
import type { Cast } from "./rider-views.ts";
import { stageEverything, warmStaged } from "./staging.ts";
import type { Staged } from "./staging.ts";
import { createWorld } from "./world.ts";
import type { World } from "./world.ts";

export interface Stage {
  track: Track;
  world: World;
  race: RaceRun;
  fleet: Fleet;
  previousCars: Float64Array;
  warming: boolean;
}

export const createStage = (
  assets: Assets,
  track: Track,
  seed: number
): Stage => {
  const world = createWorld(track);
  const race = createRaceRun(defaultSetup(track, seed));
  return {
    fleet: createFleet(assets, world.shading, race.view.cars),
    previousCars: new Float64Array(race.view.cars.length),
    race,
    track,
    warming: false,
    world,
  };
};

interface StageParts {
  readonly assets: Assets;
  readonly buildViews: () => void;
  readonly cast: Pick<Cast, "bikes" | "puffs" | "views">;
  readonly chase: ChaseCamera;
  readonly clock: Clock;
  readonly devRide: DevRide | undefined;
  readonly pipeline: Pipeline;
  readonly quality: Pick<Quality, "ladder" | "rung">;
  readonly stage: Stage;
}

export const bindStage = ({
  assets,
  buildViews,
  cast,
  chase,
  clock,
  devRide,
  pipeline,
  quality,
  stage,
}: StageParts) => {
  const player = (): RiderView => {
    const [rider] = stage.race.view.riders;
    if (!rider) {
      throw new Error("The race has no rider.");
    }
    return rider;
  };

  const retire = (): (() => void) => {
    const { scene } = stage.world;
    const oldViews = cast.views;
    const oldBikes = cast.bikes;
    const oldPuffs = cast.puffs;
    const oldFleet = stage.fleet;
    for (const view of oldViews) {
      scene.remove(view.figure.root);
    }
    if (oldBikes) {
      scene.remove(oldBikes.group);
    }
    if (oldPuffs) {
      scene.remove(oldPuffs.group);
    }
    scene.remove(oldFleet.group);
    cast.views = [];
    cast.bikes = null;
    cast.puffs = null;
    return () => {
      for (const view of oldViews) {
        view.figure.dispose();
      }
      oldBikes?.dispose();
      oldPuffs?.dispose();
      oldFleet.dispose();
    };
  };

  const takeTrack = (next: Track) => {
    if (next === stage.track) {
      return;
    }
    stage.track = next;
    stage.world = createWorld(
      stage.track,
      (quality.ladder[quality.rung] ?? quality.ladder[0])?.shadowMap
    );
    pipeline.setLook(stage.world.shading.look);
  };

  const staged = (): Staged => ({
    at: player().s,
    camera: chase.camera,
    figures: cast.views.map((view) => view.figure),
    prepare: pipeline.prepare,
    puffs: cast.puffs,
    world: stage.world,
  });

  const warmUp = () => {
    warmStaged(staged(), () => {
      pipeline.render(stage.world.scene, chase.camera);
    });
  };

  const preparation = createPreparation({
    clock,
    compile: () => {
      const unstage = stageEverything(staged());
      try {
        return pipeline.compile(stage.world.scene, chase.camera);
      } finally {
        unstage();
      }
    },
    warm: () => {
      stage.warming = false;
      warmUp();
    },
  });

  const warmNow = () => {
    stage.warming = false;
    preparation.warmNow();
  };

  const warmSoon = async (): Promise<PrepareOutcome> => {
    stage.warming = true;
    const outcome = await preparation.prepare();
    if (outcome.kind === "lost") {
      stage.warming = false;
    }
    return outcome;
  };

  const loseContext = () => {
    preparation.lose();
    stage.warming = false;
  };

  const build = (setup: RaceSetup, forRace: boolean): (() => void) => {
    const releaseActors = retire();
    const previous = stage.world;
    takeTrack(setup.track);
    const replaced = stage.world === previous ? null : previous;
    stage.race = createRaceRun(setup);
    if (forRace) {
      devRide?.place(stage.race);
    }
    const { cars } = stage.race.view;
    stage.fleet = createFleet(assets, stage.world.shading, cars);
    stage.world.scene.add(stage.fleet.group);
    stage.previousCars = new Float64Array(cars.length);
    for (const [index, car] of cars.entries()) {
      stage.previousCars[index] = car.s;
    }
    buildViews();
    chase.snap();
    return () => {
      releaseActors();
      replaced?.dispose();
    };
  };

  return {
    build,
    cancelPreparation: preparation.cancel,
    loseContext,
    player,
    restoreContext: preparation.restore,
    warmNow,
    warmSoon,
    warmUp,
  };
};
