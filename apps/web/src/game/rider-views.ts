import { HIT_STUN_TICKS } from "@racer/sim/combat";
import { RUN_SPEED } from "@racer/sim/rider-recovery";
import { clamp, TICK_RATE } from "@racer/sim/state";
import type {
  AttackKind,
  HazardEffect,
  RaceEvent,
  RaceState,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import { strikeOf } from "@racer/sim/weapons";
import { emptySupport, supportAt } from "@racer/track/features";
import type { Support } from "@racer/track/features";
import type { Track } from "@racer/track/track";
import * as THREE from "three";

import { bikeColour } from "../career/colours.ts";
import { createBikes, poseOnTrack, reachOf } from "./actors.ts";
import type { Bikes, Fleet, Reach } from "./actors.ts";
import type { Assets } from "./assets.ts";
import type { Shading } from "./cel.ts";
import type { Subject } from "./chase-camera.ts";
import { createPuffs } from "./puffs.ts";
import type { Puffs } from "./puffs.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, RiderPose, Stance } from "./rider-figure.ts";
import type { World } from "./world.ts";

const WRAP_JUMP = 30;
const LYING_PITCH = -Math.PI / 2;
const LYING_HEIGHT = 0.22;
const RISE_SECONDS = 0.3;
const LIFT_TICKS = 14;
const RUN_HZ = 2.6;
const WALKING = 0.3;
const WINDUP_TICKS = 3;
const SWING_LEAD_TICKS = 3;
const HOLD_TICKS = 4;
const RETURN_TICKS = 5;
const KICK_RISE_TICKS = 2.5;
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
const KICK_HOLD_TICKS = 2;
const KICK_RETRACT_TICKS = 3;
const KICK_DROP_FROM = 8;
const KICK_DROP_TICKS = 5;

interface Pose {
  s: number;
  x: number;
  heading: number;
  lean: number;
  air: number;
  bodyS: number;
  bodyX: number;
  bodyAir: number;
}

interface RiderView {
  readonly bike: THREE.Object3D;
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

const capture = (rider: RiderState, pose: Pose): void => {
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
  x: 0,
});

const mix = (from: number, to: number, blend: number): number =>
  from + (to - from) * blend;

const freshInput = (): RiderInput => ({
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
});

interface StrikeFrame {
  pose: RiderPose;
  reach: number;
  rise: number;
}

const strikeAt = (
  frame: StrikeFrame,
  pose: RiderPose,
  reach: number,
  rise = 0
): true => {
  frame.pose = pose;
  frame.reach = reach;
  frame.rise = rise;
  return true;
};

const windingUp = (
  attack: AttackKind,
  elapsed: number,
  land: number,
  frame: StrikeFrame
): true => {
  if (attack !== "swing") {
    return strikeAt(frame, attack, elapsed / land);
  }
  const lead = land - SWING_LEAD_TICKS;
  if (elapsed < lead) {
    return strikeAt(frame, "windup", Math.min(1, elapsed / WINDUP_TICKS));
  }
  return strikeAt(frame, "swing", (elapsed - lead) / SWING_LEAD_TICKS);
};

const kickFrame = (
  elapsed: number,
  land: number,
  frame: StrikeFrame
): boolean => {
  const dropped = (elapsed - KICK_DROP_FROM) / KICK_DROP_TICKS;
  if (dropped >= 1) {
    return false;
  }
  const rising = 1 - Math.max(0, 1 - elapsed / KICK_RISE_TICKS) ** 2;
  const rise = dropped > 0 ? 1 - dropped * dropped : rising;
  const snap = (elapsed - KICK_RISE_TICKS) / (land - KICK_RISE_TICKS);
  const retract = (elapsed - land - KICK_HOLD_TICKS) / KICK_RETRACT_TICKS;
  return strikeAt(
    frame,
    "kick",
    clamp(Math.min(snap, 1 - retract), 0, 1),
    rise
  );
};

const flinchOf = (rider: RiderState, subTick: number): number =>
  Math.max(0, rider.hitStun - subTick) / HIT_STUN_TICKS;

const strikeFrame = (
  rider: RiderState,
  subTick: number,
  frame: StrikeFrame
): boolean => {
  if (rider.attack === "none") {
    return false;
  }
  const strike = strikeOf(rider.attack, rider.weapon);
  const land = strike.ticks - strike.strikeTick;
  const elapsed = strike.ticks - rider.attackTicks + subTick;
  if (rider.attack === "kick") {
    return kickFrame(elapsed, land, frame);
  }
  const out = rider.attack === "swing" ? "swung" : rider.attack;
  if (elapsed < land) {
    return windingUp(rider.attack, elapsed, land, frame);
  }
  if (elapsed < land + HOLD_TICKS) {
    return strikeAt(frame, out, 1);
  }
  const back = (elapsed - land - HOLD_TICKS) / RETURN_TICKS;
  return back < 1 && strikeAt(frame, out, 1 - back);
};

const settleSag = (view: RiderView, seconds: number) => {
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
  views: RiderView[];
  bikes: Bikes | null;
  puffs: Puffs | null;
  readonly deck: Support;
  riderReach: Reach;
  inputs: RiderInput[];
  plates: string[];
  clock: number;
  readonly subject: Subject;
  readonly stance: Stance;
  readonly strike: StrikeFrame;
  readonly placed: Placed;
}

export const createCast = (shading: Shading): Cast => ({
  bikes: null,
  clock: 0,
  deck: emptySupport(),
  inputs: [],
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
  plates: [],
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
    time: 0,
    tuck: 0,
    weapon: "none",
  },
  strike: { pose: "seated", reach: 0, rise: 0 },
  subject: { air: 0, s: 0, speed: 0, tuck: 0, x: 0 },
  views: [],
});

interface CastStage {
  readonly race: RaceState;
  readonly track: Track;
  readonly world: World;
  readonly fleet: Fleet;
  readonly previousCars: Float64Array;
}

interface CastParts {
  readonly assets: Assets;
  readonly cast: Cast;
  readonly stage: CastStage;
}

export const bindCast = ({ assets, cast, stage }: CastParts) => {
  const { deck, placed, stance, strike, subject } = cast;

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

  const buildViews = () => {
    dropViews();
    const fleetOfBikes = createBikes(
      assets,
      stage.world.shading,
      stage.race.riders.map((rider) => ({
        paint: rider.profile.paint,
        police: rider.profile.role === "police",
      }))
    );
    cast.bikes = fleetOfBikes;
    cast.riderReach = reachOf(stage.world.shading);
    stage.world.scene.add(fleetOfBikes.group);
    cast.puffs = createPuffs(stage.world.shading);
    stage.world.scene.add(cast.puffs.group);
    cast.views = stage.race.riders.map((rider, index) => {
      const bike = fleetOfBikes.roots[index] ?? new THREE.Object3D();
      const figure = createRiderFigure(
        assets,
        stage.world.shading,
        rider.profile.jacket,
        index
      );
      stage.world.scene.add(figure.root);
      const view: RiderView = {
        after: emptyPose(),
        before: emptyPose(),
        bike,
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
    cast.inputs = stage.race.riders.map(() => freshInput());
    cast.plates = stage.race.riders.map((rider) =>
      bikeColour(rider.profile.paint)
    );
  };

  const touchHazard = (
    effect: HazardEffect,
    view: RiderView,
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

  const touchDown = (event: RaceEvent) => {
    const view = cast.views[event.rider];
    const rider = stage.race.riders[event.rider];
    if (!(view && rider)) {
      return;
    }
    const near = event.rider === 0 || withinReach(rider.s);
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
    const { riders } = stage.race;
    for (let index = 0; index < riders.length; index += 1) {
      const rider = riders[index];
      const view = cast.views[index];
      if (rider && view) {
        capture(rider, view[into]);
      }
    }
  };

  const holdStill = () => {
    captureAll("after");
  };

  const flinchSideOf = (rider: RiderState): number => {
    const hitter = stage.race.riders[rider.lastHitBy];
    return hitter ? Math.sign(rider.x - hitter.x) || 1 : 1;
  };

  const placeFigure = (
    rider: RiderState,
    view: RiderView,
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
      } else if (strikeFrame(rider, subTick, strike)) {
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
    stance.side = rider.attackSide;
    stance.weapon = rider.weapon;
    stance.tuck = seated ? rider.tuck : 0;
    stance.lean = seated ? lean / rider.bike.visualLean : 0;
    stance.reach = reach;
    stance.rise = rise;
    stance.flinch = seated ? flinchOf(rider, subTick) : 0;
    stance.flinchSide = flinchSideOf(rider);
  };

  const drawRider = (
    index: number,
    rider: RiderState,
    view: RiderView,
    blend: number,
    seconds: number
  ) => {
    const { before, after, bike } = view;
    const s = mix(before.s, after.s, blend);
    const x = mix(before.x, after.x, blend);
    const air = mix(before.air, after.air, blend);
    const lean = mix(before.lean, after.lean, blend);
    const heading = mix(before.heading, after.heading, blend);
    const bodyS = mix(before.bodyS, after.bodyS, blend);
    const bodyX = mix(before.bodyX, after.bodyX, blend);
    const bodyAir = mix(before.bodyAir, after.bodyAir, blend);
    const seated = rider.mode === "riding" || rider.mode === "mounting";
    const pitch = rider.airborne
      ? Math.atan2(rider.verticalSpeed, Math.max(rider.speed, 1)) * 0.6
      : Math.atan(supportAt(stage.track, s, x, deck).slope);

    poseOnTrack(bike, stage.track, s, x, air, heading, lean, pitch);
    cast.bikes?.spin(index, rider.speed * seconds);
    settleSag(view, seconds);
    cast.bikes?.sag(index, view.sag);
    if (index === 0 || withinReach(s)) {
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
    if (index === 0 || withinReach(seated ? s : bodyS)) {
      view.figure.animate(stance, seconds);
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

  const followPlayer = (rider: RiderState) => {
    const onBike = placed.seated || placed.s < placed.bodyS;
    subject.s = onBike ? placed.s : placed.bodyS;
    subject.x = onBike ? placed.x : placed.bodyX;
    subject.air = onBike ? placed.air : Math.min(placed.bodyAir, 2);
    subject.speed = placed.seated ? rider.speed : 0;
    subject.tuck = placed.seated ? rider.tuck : 0;
  };

  const placeFleet = (blend: number) => {
    const { cars } = stage.race;
    for (let index = 0; index < cars.length; index += 1) {
      const s = cars[index]?.s ?? 0;
      const from = stage.previousCars[index] ?? s;
      const wrapped = Math.abs(s - from) > WRAP_JUMP;
      stage.fleet.place(stage.track, index, wrapped ? s : mix(from, s, blend));
    }
    stage.fleet.commit(subject.s);
  };

  return {
    buildViews,
    captureAll,
    drawRider,
    dropFleet,
    dropViews,
    followPlayer,
    holdStill,
    placeFleet,
    touchDown,
  };
};
