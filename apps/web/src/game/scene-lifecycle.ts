import type { RoomRun } from "@racer/rooms/room-run";
import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import type { RiderView } from "@racer/sim/race-view";
import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import type { Controller, RaceSetup, RiderId } from "@racer/sim/state";
import type { Track } from "@racer/track/track";

import type { PrepareOutcome } from "../prepare-outcome.ts";
import type { Assets } from "./assets.ts";
import type { ChaseCamera } from "./chase-camera.ts";
import type { DevRide } from "./dev-ride.ts";
import { releaseAll } from "./dispose.ts";
import type { Dressing } from "./figure-wardrobe.ts";
import { createFleet } from "./fleet.ts";
import type { Fleet } from "./fleet.ts";
import type { Pipeline } from "./post.ts";
import { createPreparation } from "./preparation.ts";
import type { Clock } from "./preparation.ts";
import type { Quality } from "./presets.ts";
import type { Actors, Cast, CastTarget } from "./rider-views.ts";
import { stageEverything, warmStaged } from "./staging.ts";
import type { Staged } from "./staging.ts";
import { createWorld } from "./world.ts";
import type { World } from "./world.ts";

export interface Stage {
  colours: ReadonlyMap<RiderId, number>;
  track: Track;
  world: World;
  race: RaceRun;
  me: RiderId;
  fleet: Fleet;
  previousCars: Float64Array;
  previousCrossCars: Float64Array;
  warming: boolean;
}

const ridden = (setup: RaceSetup, controller: Controller): RaceSetup => ({
  ...setup,
  player: { ...setup.player, controller },
});

export const createStage = (
  assets: Assets,
  track: Track,
  seed: number,
  shadowMap: number
): Stage => {
  const world = createWorld(track, assets, shadowMap);
  const race = createRaceRun(ridden(defaultSetup(track, seed), "pilot"));
  return {
    colours: new Map(),
    fleet: createFleet(
      assets,
      world.shading,
      race.view.cars,
      race.view.crossCars
    ),
    me: PLAYER_RIDER,
    previousCars: new Float64Array(race.view.cars.length),
    previousCrossCars: new Float64Array(race.view.crossCars.length),
    race,
    track,
    warming: false,
    world,
  };
};

interface StageParts {
  readonly assets: Assets;
  readonly autopilot: boolean;
  readonly cast: Pick<Cast, "bikes" | "puffs" | "views">;
  readonly castFor: (onto: CastTarget, dressing: Dressing) => Actors;
  readonly chase: Pick<ChaseCamera, "camera" | "snap">;
  readonly clock: Clock;
  readonly devRide: DevRide | undefined;
  readonly pipeline: Pick<
    Pipeline,
    "compile" | "prepare" | "render" | "setLook"
  >;
  readonly quality: Pick<Quality, "preset">;
  readonly showCast: (actors: Actors) => void;
  readonly stage: Stage;
}

interface Replacement {
  readonly actors: Actors;
  readonly colours: ReadonlyMap<RiderId, number>;
  readonly fleet: Fleet;
  readonly race: RaceRun;
  readonly world: World;
}

export const bindStage = ({
  assets,
  autopilot,
  cast,
  castFor,
  chase,
  clock,
  devRide,
  pipeline,
  quality,
  showCast,
  stage,
}: StageParts) => {
  const player = (): RiderView => {
    const rider = riderOf(stage.race.view.riders, stage.me);
    if (!rider) {
      throw new Error("The race has no player.");
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

  const localRace = (setup: RaceSetup, forRace: boolean): RaceRun => {
    const local = createRaceRun(
      ridden(setup, forRace && !autopilot ? "human" : "pilot")
    );
    if (forRace) {
      devRide?.place(local);
    }
    return local;
  };

  const replacementFor = (
    setup: RaceSetup,
    dressing: Dressing,
    forRace: boolean,
    room: RoomRun | null,
    owners: (() => void)[]
  ): Replacement => {
    const world =
      setup.track === stage.track
        ? stage.world
        : createWorld(setup.track, assets, quality.preset.shadowMap);
    if (world !== stage.world) {
      owners.push(() => {
        world.dispose();
      });
    }
    const colours = room?.riderColours ?? new Map<RiderId, number>();
    const race = room ?? localRace(setup, forRace);
    const { cars, crossCars } = race.view;
    const fleet = createFleet(assets, world.shading, cars, crossCars);
    owners.push(() => {
      fleet.dispose();
    });
    const actors = castFor({ colours, race, world }, dressing);
    return { actors, colours, fleet, race, world };
  };

  const build = (
    setup: RaceSetup,
    dressing: Dressing,
    forRace: boolean,
    room: RoomRun | null = null
  ): (() => void) => {
    const owners: (() => void)[] = [];
    let next: Replacement;
    try {
      next = replacementFor(setup, dressing, forRace, room, owners);
    } catch (error) {
      releaseAll(owners);
      throw error;
    }
    const releaseActors = retire();
    const previous = stage.world;
    const replaced = next.world === previous ? null : previous;
    stage.track = setup.track;
    stage.world = next.world;
    if (replaced) {
      pipeline.setLook(next.world.shading.look);
    }
    stage.colours = next.colours;
    stage.race = next.race;
    stage.me = room?.me ?? PLAYER_RIDER;
    const { cars, crossCars } = next.race.view;
    stage.fleet = next.fleet;
    stage.world.scene.add(next.fleet.group);
    stage.previousCars = new Float64Array(cars.length);
    for (let index = 0; index < cars.length; index += 1) {
      stage.previousCars[index] = cars[index]?.s ?? 0;
    }
    stage.previousCrossCars = new Float64Array(crossCars.length);
    for (let index = 0; index < crossCars.length; index += 1) {
      stage.previousCrossCars[index] = crossCars[index]?.travel ?? 0;
    }
    showCast(next.actors);
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
