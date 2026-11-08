import { riderBlocks } from "@racer/sim/palette";
import type { RiderBlocks } from "@racer/sim/palette";
import type { RaceRun } from "@racer/sim/race-run";
import type { RiderView } from "@racer/sim/race-view";
import { RUN_SPEED } from "@racer/sim/rider-recovery";
import { clamp, riderOf, TICK_RATE } from "@racer/sim/state";
import type { HazardEffect, RaceEvent, RiderId } from "@racer/sim/state";
import type { Track } from "@racer/track/track";
import * as THREE from "three";

import { createBikes, poseOnTrack, reachOf } from "./actors.ts";
import type { Bikes, Reach } from "./actors.ts";
import type { Assets } from "./assets.ts";
import { bikeModelFor } from "./bike-models.ts";
import type { Shading } from "./cel.ts";
import type { Subject } from "./chase-camera.ts";
import { crossCarPose } from "./cross-car-pose.ts";
import type { CrossCarPose } from "./cross-car-pose.ts";
import { releaseAll } from "./dispose.ts";
import { kneeScrapes } from "./figure-pose.ts";
import type { RiderPose } from "./figure-pose.ts";
import { bodyFor, paletteOf } from "./figure-rig.ts";
import type { Dressing } from "./figure-wardrobe.ts";
import type { Fleet } from "./fleet.ts";
import type { Palette } from "./model-slots.ts";
import { createPuffs } from "./puffs.ts";
import type { Puffs } from "./puffs.ts";
import { blockPaletteOf } from "./rider-blocks.ts";
import {
  captureCast,
  clearDrift,
  driftSettle,
  stillDrift,
} from "./rider-drift.ts";
import type { RiderDrift } from "./rider-drift.ts";
import {
  fightFlinch,
  fightHeard,
  fightTick,
  quietFight,
  strikeFrame,
} from "./rider-fight.ts";
import type { RiderFight, StrikeFrame } from "./rider-fight.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, Stance } from "./rider-figure.ts";
import type { World } from "./world.ts";

const WRAP_JUMP = 30;
const LYING_PITCH = -Math.PI / 2;
const LYING_HEIGHT = 0.22;
const RISE_SECONDS = 0.3;
const LIFT_TICKS = 14;
const RUN_HZ = 2.6;
const WALKING = 0.3;
const SAG_PER_IMPACT = 0.45;
const MOST_SAG_KICK = 3.2;
const SAG_STIFFNESS = 260;
const SAG_DAMPING = 16;
const SAG_STEP = 1 / 240;
const MOST_SAG = 0.16;
const PUFF_AIR_SECONDS = 0.2;
const PUFF_PER_IMPACT = 0.1;
const POTHOLE_SAG_KICK = 1.6;
const HAZARD_PUFF = 0.6;

interface Pose {
  tick: number;
  s: number;
  x: number;
  heading: number;
  lean: number;
  air: number;
  bodyS: number;
  bodyX: number;
  bodyAir: number;
}

interface DrawnPlace {
  blend: number;
  fromTick: number;
  s: number;
  toTick: number;
  x: number;
}

interface RiderActor {
  readonly bike: THREE.Object3D;
  readonly drift: RiderDrift;
  readonly drawn: DrawnPlace;
  readonly fight: RiderFight;
  readonly figure: RiderFigure;
  readonly before: Pose;
  readonly after: Pose;
  tumbleAngle: number;
  pitch: number;
  lift: number;
  yaw: number;
  stride: number;
  sag: number;
  sagSpeed: number;
}

const capture = (rider: RiderView, pose: Pose): void => {
  pose.s = rider.s;
  pose.x = rider.x;
  pose.heading = rider.heading;
  pose.lean = rider.lean;
  pose.air = rider.air;
  pose.bodyS = rider.bodyS;
  pose.bodyX = rider.bodyX;
  pose.bodyAir = rider.bodyAir;
};

const emptyPose = (): Pose => ({
  air: 0,
  bodyAir: 0,
  bodyS: 0,
  bodyX: 0,
  heading: 0,
  lean: 0,
  s: 0,
  tick: 0,
  x: 0,
});

const mix = (from: number, to: number, blend: number): number =>
  from + (to - from) * blend;

const settleSag = (view: RiderActor, seconds: number) => {
  for (let left = seconds; left > 0; left -= SAG_STEP) {
    const step = Math.min(SAG_STEP, left);
    view.sagSpeed -=
      (SAG_STIFFNESS * view.sag + SAG_DAMPING * view.sagSpeed) * step;
    view.sag = clamp(view.sag + view.sagSpeed * step, -MOST_SAG / 2, MOST_SAG);
  }
};

interface Placed {
  s: number;
  x: number;
  air: number;
  lean: number;
  bodyS: number;
  bodyX: number;
  bodyAir: number;
  seated: boolean;
}

export interface Cast {
  views: RiderActor[];
  bikes: Bikes | null;
  puffs: Puffs | null;
  riderReach: Reach;
  clock: number;
  readonly subject: Subject;
  readonly stance: Stance;
  readonly strike: StrikeFrame;
  readonly placed: Placed;
}

export const createCast = (shading: Shading): Cast => ({
  bikes: null,
  clock: 0,
  placed: {
    air: 0,
    bodyAir: 0,
    bodyS: 0,
    bodyX: 0,
    lean: 0,
    s: 0,
    seated: true,
    x: 0,
  },
  puffs: null,
  riderReach: reachOf(shading),
  stance: {
    flinch: 0,
    flinchSide: 1,
    lean: 0,
    pose: "seated",
    reach: 0,
    rise: 0,
    side: 1,
    speed: 0,
    time: 0,
    tuck: 0,
    weapon: "none",
  },
  strike: { pose: "seated", reach: 0, rise: 0 },
  subject: { air: 0, s: 0, speed: 0, tuck: 0, x: 0 },
  views: [],
});

interface CastStage {
  readonly colours: ReadonlyMap<RiderId, number>;
  readonly me: RiderId;
  readonly race: Pick<RaceRun, "takeCorrections" | "takeFights" | "view">;
  readonly track: Track;
  readonly world: World;
  readonly fleet: Fleet;
  readonly previousCars: Float64Array;
  readonly previousCrossCars: Float64Array;
}

export interface Actors {
  readonly bikes: Bikes;
  readonly puffs: Puffs;
  readonly views: RiderActor[];
}

export interface CastTarget {
  readonly colours: ReadonlyMap<RiderId, number>;
  readonly race: Pick<RaceRun, "view">;
  readonly world: Pick<World, "shading">;
}

interface CastParts {
  readonly assets: Assets;
  readonly cast: Cast;
  readonly stage: CastStage;
}

export const bindCast = ({ assets, cast, stage }: CastParts) => {
  const { placed, stance, strike, subject } = cast;

  const dropViews = () => {
    for (const view of cast.views) {
      stage.world.scene.remove(view.figure.root);
      view.figure.dispose();
    }
    cast.views = [];
    if (cast.bikes) {
      stage.world.scene.remove(cast.bikes.group);
      cast.bikes.dispose();
      cast.bikes = null;
    }
    if (cast.puffs) {
      stage.world.scene.remove(cast.puffs.group);
      cast.puffs.dispose();
      cast.puffs = null;
    }
  };

  const dropFleet = () => {
    stage.world.scene.remove(stage.fleet.group);
    stage.fleet.dispose();
  };

  const castFor = (onto: CastTarget, dressing: Dressing): Actors => {
    const { riders } = onto.race.view;
    const { shading } = onto.world;
    const blocksOf = (rider: RiderId): RiderBlocks | undefined =>
      riderBlocks[onto.colours.get(rider) ?? riderBlocks.length];
    const worn = ({ id, profile }: RiderView): Palette => {
      const blocks = blocksOf(id);
      return blocks ? blockPaletteOf(blocks) : paletteOf(profile.jacket);
    };
    const owners: (() => void)[] = [];
    try {
      const bikes = createBikes(
        assets,
        shading,
        riders.map((rider) => ({
          livery: blocksOf(rider.id)?.livery,
          model: bikeModelFor(rider.bike.id),
          paint: rider.profile.paint,
          police: rider.profile.role === "police",
        }))
      );
      owners.push(() => {
        bikes.dispose();
      });
      const puffs = createPuffs(shading);
      owners.push(() => {
        puffs.dispose();
      });
      const views = riders.map((rider) => {
        const figure = createRiderFigure(
          dressing.get(rider.id) ?? bodyFor(assets, rider.id),
          shading,
          worn(rider)
        );
        owners.push(() => {
          figure.dispose();
        });
        const view: RiderActor = {
          after: emptyPose(),
          before: emptyPose(),
          bike: riderOf(bikes.roots, rider.id) ?? new THREE.Object3D(),
          drawn: { blend: 0, fromTick: 0, s: 0, toTick: 0, x: 0 },
          drift: stillDrift(),
          fight: quietFight(),
          figure,
          lift: figure.standHeight,
          pitch: 0,
          sag: 0,
          sagSpeed: 0,
          stride: 0,
          tumbleAngle: 0,
          yaw: 0,
        };
        capture(rider, view.before);
        capture(rider, view.after);
        return view;
      });
      return { bikes, puffs, views };
    } catch (error) {
      releaseAll(owners);
      throw error;
    }
  };

  const showCast = ({ bikes, puffs, views }: Actors) => {
    const { scene, shading } = stage.world;
    scene.add(
      bikes.group,
      puffs.group,
      ...views.map(({ figure }) => figure.root)
    );
    cast.bikes = bikes;
    cast.puffs = puffs;
    cast.views = views;
    cast.riderReach = reachOf(shading);
    Reflect.set(globalThis, "__rushlineCast", cast.views);
  };

  const touchHazard = (
    effect: HazardEffect,
    view: RiderActor,
    speed: number,
    near: boolean
  ) => {
    if (effect === "jolt" || effect === "bump") {
      view.sagSpeed += POTHOLE_SAG_KICK;
    }
    if ((effect === "stagger" || effect === "bump") && near) {
      cast.puffs?.burst(view.bike, HAZARD_PUFF, speed);
    }
  };
  const withinReach = (s: number): boolean =>
    s >= subject.s - cast.riderReach.behind &&
    s <= subject.s + cast.riderReach.ahead;

  const ageFights = () => {
    const { riders, tick } = stage.race.view;
    for (let index = 0; index < cast.views.length; index += 1) {
      const view = cast.views[index];
      const rider = riders[index];
      if (view && rider) {
        fightTick(view.fight, rider.airborne, tick);
      }
    }
  };

  const touchDown = (event: RaceEvent) => {
    const view = riderOf(cast.views, event.rider);
    const rider = riderOf(stage.race.view.riders, event.rider);
    if (!(view && rider)) {
      return;
    }
    const near = event.rider === stage.me || withinReach(rider.s);
    if (event.kind === "land") {
      view.sagSpeed += Math.min(MOST_SAG_KICK, -event.impact * SAG_PER_IMPACT);
      if (near && event.airSeconds > PUFF_AIR_SECONDS) {
        cast.puffs?.burst(
          view.bike,
          -event.impact * PUFF_PER_IMPACT,
          rider.speed
        );
      }
    } else if (
      event.kind === "crash" &&
      (event.cause === "landing" || event.cause === "hazard") &&
      near
    ) {
      cast.puffs?.burst(view.bike, 1, rider.speed);
    } else if (event.kind === "hazard") {
      touchHazard(event.effect, view, rider.speed, near);
    }
  };

  const captureAll = (into: "before" | "after") => {
    captureCast(
      into,
      stage.race.view.riders,
      cast.views,
      stage.race.takeCorrections(),
      capture
    );
    const { tick } = stage.race.view;
    for (const view of cast.views) {
      view[into].tick = tick;
    }
  };

  const holdStill = () => {
    captureAll("after");
  };

  const hearFights = () => {
    const { tick } = stage.race.view;
    for (const heard of stage.race.takeFights()) {
      fightHeard(cast.views, heard, tick);
    }
  };

  const flinchSideOf = (rider: RiderView): number => {
    const hitter = riderOf(stage.race.view.riders, rider.lastHitBy);
    return hitter ? Math.sign(rider.x - hitter.x) || 1 : 1;
  };

  const placeFigure = (
    rider: RiderView,
    view: RiderActor,
    seated: boolean,
    bodyS: number,
    bodyX: number,
    bodyAir: number,
    lean: number,
    subTick: number,
    seconds: number
  ) => {
    let pose: RiderPose = "seated";
    let reach = 0;
    let rise = 0;
    let time = cast.clock;
    const { figure, bike } = view;
    if (seated) {
      if (rider.mode === "mounting" && rider.modeTicks < LIFT_TICKS) {
        pose = "lift";
      } else if (strikeFrame(view.fight, subTick, strike)) {
        ({ pose, reach, rise } = strike);
      }
      figure.root.position.copy(bike.position);
      figure.root.quaternion.copy(bike.quaternion);
      figure.root.translateY(figure.seat.y - view.sag);
      figure.root.translateZ(figure.seat.z);
      view.tumbleAngle = 0;
      view.pitch = 0;
      view.lift = figure.standHeight;
      view.yaw = 0;
    } else if (
      rider.mode === "thrown" ||
      rider.mode === "lying" ||
      rider.mode === "wrecked"
    ) {
      const resting = rider.bodySpeed < 0.5 && rider.bodyAir === 0;
      pose = resting ? "lying" : "tumble";
      if (resting) {
        view.pitch += (LYING_PITCH - view.pitch) * Math.min(1, seconds * 6);
        view.lift += (LYING_HEIGHT - view.lift) * Math.min(1, seconds * 6);
      } else {
        view.tumbleAngle -= (5 + rider.bodySpeed * 0.4) * seconds;
        view.pitch = view.tumbleAngle;
        view.lift = 0.5;
      }
      poseOnTrack(
        figure.root,
        stage.track,
        bodyS,
        bodyX,
        bodyAir + view.lift,
        view.yaw,
        0,
        view.pitch
      );
    } else if (rider.mode === "busted") {
      pose = "surrender";
      view.pitch = 0;
      view.lift = figure.standHeight;
      poseOnTrack(
        figure.root,
        stage.track,
        bodyS,
        bodyX,
        view.lift,
        view.yaw,
        0,
        0
      );
    } else {
      const runPace =
        Math.hypot(rider.bodySpeed, rider.bodyLateralSpeed) / RUN_SPEED;
      const moving = runPace > WALKING / RUN_SPEED;
      pose = moving ? "run" : "stand";
      time = view.stride;
      view.stride += runPace * seconds;
      const standUp = Math.min(1, rider.modeTicks / TICK_RATE / RISE_SECONDS);
      const eased = standUp * standUp * (3 - 2 * standUp);
      view.pitch = LYING_PITCH * (1 - eased);
      const bob = moving
        ? Math.abs(Math.sin(view.stride * Math.PI * 2 * RUN_HZ)) * 0.05
        : 0;
      view.lift =
        LYING_HEIGHT + (figure.standHeight - LYING_HEIGHT) * eased + bob;
      if (moving) {
        view.yaw = Math.atan2(rider.bodyLateralSpeed, rider.bodySpeed);
      } else if (standUp >= 0.5 && standUp < 1) {
        view.yaw = Math.atan2(rider.x - rider.bodyX, rider.s - rider.bodyS);
      }
      poseOnTrack(
        figure.root,
        stage.track,
        bodyS,
        bodyX,
        view.lift,
        view.yaw,
        0,
        view.pitch
      );
    }
    stance.pose = pose;
    stance.time = time;
    stance.side = view.fight.side;
    stance.weapon = rider.weapon;
    stance.tuck = seated ? rider.tuck : 0;
    stance.lean = seated ? lean / rider.bike.visualLean : 0;
    stance.speed = rider.speed;
    stance.reach = reach;
    stance.rise = rise;
    stance.flinch = seated
      ? fightFlinch(view.fight, rider.hitStun, subTick)
      : 0;
    stance.flinchSide = flinchSideOf(rider);
  };

  const drawRider = (
    index: number,
    rider: RiderView,
    view: RiderActor,
    blend: number,
    seconds: number
  ) => {
    const { before, after, bike, drift } = view;
    const seated = rider.mode === "riding" || rider.mode === "mounting";
    if (seated) {
      driftSettle(drift, seconds, rider.speed);
    } else {
      clearDrift(drift);
    }
    const s = mix(before.s, after.s, blend) + drift.s;
    const x = mix(before.x, after.x, blend) + drift.x;
    view.drawn.blend = blend;
    view.drawn.fromTick = before.tick;
    view.drawn.s = s;
    view.drawn.toTick = after.tick;
    view.drawn.x = x;
    const air = mix(before.air, after.air, blend);
    const lean = mix(before.lean, after.lean, blend) + drift.lean;
    const heading = mix(before.heading, after.heading, blend) + drift.heading;
    const bodyS = mix(before.bodyS, after.bodyS, blend);
    const bodyX = mix(before.bodyX, after.bodyX, blend);
    const bodyAir = mix(before.bodyAir, after.bodyAir, blend);
    const pitch = rider.airborne
      ? Math.atan2(rider.verticalSpeed, Math.max(rider.speed, 1)) * 0.6
      : 0;

    poseOnTrack(bike, stage.track, s, x, air, heading, lean, pitch);
    cast.bikes?.spin(index, rider.speed * seconds);
    settleSag(view, seconds);
    cast.bikes?.sag(index, view.sag);
    if (index === stage.me || withinReach(s)) {
      cast.bikes?.show(index);
    }
    placeFigure(
      rider,
      view,
      seated,
      bodyS,
      bodyX,
      bodyAir,
      lean,
      blend,
      seconds
    );
    if (index === stage.me || withinReach(seated ? s : bodyS)) {
      view.figure.animate(stance, seconds);
      if (kneeScrapes(stance.lean, stance.speed)) {
        cast.puffs?.scrape(view.bike, Math.sign(stance.lean), rider.speed);
      }
    } else {
      view.figure.rest();
    }
    placed.air = air;
    placed.bodyAir = bodyAir;
    placed.bodyS = bodyS;
    placed.bodyX = bodyX;
    placed.lean = lean;
    placed.s = s;
    placed.seated = seated;
    placed.x = x;
  };

  const crossPose: CrossCarPose = { s: 0, x: 0, yaw: 0 };

  const followPlayer = (rider: RiderView) => {
    const onBike = placed.seated || placed.s < placed.bodyS;
    subject.s = onBike ? placed.s : placed.bodyS;
    subject.x = onBike ? placed.x : placed.bodyX;
    subject.air = onBike ? placed.air : Math.min(placed.bodyAir, 2);
    subject.speed = placed.seated ? rider.speed : 0;
    subject.tuck = placed.seated ? rider.tuck : 0;
  };

  const placeFleet = (blend: number) => {
    const { cars } = stage.race.view;
    for (let index = 0; index < cars.length; index += 1) {
      const s = cars[index]?.s ?? 0;
      const from = stage.previousCars[index] ?? s;
      const wrapped = Math.abs(s - from) > WRAP_JUMP;
      stage.fleet.place(stage.track, index, wrapped ? s : mix(from, s, blend));
    }
    const { crossCars } = stage.race.view;
    for (let index = 0; index < crossCars.length; index += 1) {
      const car = crossCars[index];
      if (car && car.wait === 0) {
        const from = stage.previousCrossCars[index] ?? car.travel;
        crossCarPose(
          car,
          from > car.travel ? car.travel : mix(from, car.travel, blend),
          crossPose
        );
        stage.fleet.placeCrossCar(stage.track, index, crossPose);
      } else {
        stage.fleet.hideCrossCar(index);
      }
    }
    stage.fleet.commit(subject.s);
  };

  return {
    ageFights,
    captureAll,
    castFor,
    drawRider,
    dropFleet,
    dropViews,
    followPlayer,
    hearFights,
    holdStill,
    placeFleet,
    showCast,
    touchDown,
  };
};

const RIDER_METRES = 1.6;

export const pickFarRiders = (
  views: readonly { readonly figure: RiderFigure }[],
  me: number,
  camera: THREE.PerspectiveCamera,
  canvasHeight: number
): void => {
  const perMetre =
    canvasHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  for (let index = 0; index < views.length; index += 1) {
    const figure = views[index]?.figure;
    if (figure && index !== me) {
      figure.judgeFar(
        (RIDER_METRES / camera.position.distanceTo(figure.root.position)) *
          perMetre
      );
    }
  }
};
