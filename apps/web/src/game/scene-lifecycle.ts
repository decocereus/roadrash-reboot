import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import type { RiderView } from "@racer/sim/race-view";
import type { RaceSetup } from "@racer/sim/state";
import type { Track } from "@racer/track/track";
import type * as THREE from "three";

import { createFleet } from "./actors.ts";
import type { Fleet } from "./actors.ts";
import type { Assets } from "./assets.ts";
import type { ChaseCamera } from "./chase-camera.ts";
import type { DevRide } from "./dev-ride.ts";
import { isMesh } from "./meshes.ts";
import type { Compiling, Pipeline } from "./post.ts";
import type { Quality } from "./quality-ladder.ts";
import type { Cast } from "./rider-views.ts";
import { createWorld } from "./world.ts";
import type { World } from "./world.ts";

const COMPILE_TIMEOUT_MS = 5000;

interface Compile {
  readonly load: number;
  readonly compiling: Compiling;
  readonly done: (current: boolean) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

const revealAll = (root: THREE.Object3D): (() => void) => {
  const hidden: THREE.Object3D[] = [];
  const culled: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (!node.visible) {
      hidden.push(node);
      node.visible = true;
    }
    if (node.frustumCulled) {
      culled.push(node);
      node.frustumCulled = false;
    }
  });
  return () => {
    for (const node of hidden) {
      node.visible = false;
    }
    for (const node of culled) {
      node.frustumCulled = true;
    }
  };
};

const dropGeometry = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    if (isMesh(node)) {
      node.geometry.dispose();
    }
  });
};

export interface Stage {
  track: Track;
  world: World;
  race: RaceRun;
  fleet: Fleet;
  previousCars: Float64Array;
  loads: number;
  warming: boolean;
  alive: boolean;
  readonly compiles: Set<Compile>;
}

export const createStage = (
  assets: Assets,
  track: Track,
  seed: number
): Stage => {
  const world = createWorld(track);
  const race = createRaceRun(defaultSetup(track, seed));
  return {
    alive: true,
    compiles: new Set<Compile>(),
    fleet: createFleet(assets, world.shading, race.view.cars),
    loads: 0,
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
  devRide,
  pipeline,
  quality,
  stage,
}: StageParts) => {
  const { compiles } = stage;

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

  const stageEverything = (): (() => void) => {
    stage.world.follow(chase.camera, player().s);
    const samples = stage.world.samples();
    stage.world.scene.add(samples);
    const unarm = cast.views.map((view) => view.figure.holdEveryWeapon());
    const unprime = cast.puffs?.prime();
    pipeline.prepare(stage.world.scene);
    const restore = revealAll(stage.world.scene);
    return () => {
      restore();
      unprime?.();
      for (const each of unarm) {
        each();
      }
      stage.world.scene.remove(samples);
      dropGeometry(samples);
    };
  };

  const warmUp = () => {
    const unstage = stageEverything();
    pipeline.render(stage.world.scene, chase.camera);
    unstage();
  };

  const finishCompile = (job: Compile) => {
    if (!compiles.delete(job)) {
      return;
    }
    clearTimeout(job.timer);
    job.compiling.stop?.();
    if (!stage.alive || job.load !== stage.loads) {
      job.done(false);
      return;
    }
    stage.warming = false;
    try {
      warmUp();
    } finally {
      job.done(true);
    }
  };

  const finishWhenReady = async (job: Compile): Promise<void> => {
    await job.compiling.ready;
    finishCompile(job);
  };

  const abandonCompiles = () => {
    for (const job of compiles) {
      finishCompile(job);
    }
  };

  const warmNow = () => {
    stage.loads += 1;
    abandonCompiles();
    stage.warming = false;
    warmUp();
  };

  const warmSoon = async (): Promise<boolean> => {
    stage.loads += 1;
    abandonCompiles();
    stage.warming = true;
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const unstage = stageEverything();
    const compiling = pipeline.compile(stage.world.scene, chase.camera);
    unstage();
    const job: Compile = {
      compiling,
      done: resolve,
      load: stage.loads,
      timer: undefined,
    };
    job.timer = setTimeout(() => {
      finishCompile(job);
    }, COMPILE_TIMEOUT_MS);
    compiles.add(job);
    void finishWhenReady(job);
    return await promise;
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

  return { abandonCompiles, build, player, warmNow, warmSoon, warmUp };
};
