import { carryPush, shoveRider } from "@racer/sim/lobby";
import { GARAGE_PLINTH, PLINTH } from "@racer/sim/lobby-floor";
import { riderBlocks } from "@racer/sim/palette";
import type { RiderBlocks } from "@racer/sim/palette";
import * as THREE from "three";

import type { Assets } from "./assets.ts";
import type { BarCompany } from "./bar-player.ts";
import { poseTurns, breathTurns } from "./bar-poses.ts";
import type { BarSpeech } from "./bar-speech.ts";
import type { Tag, TagLayer } from "./bar-tags.ts";
import type { Shading } from "./cel.ts";
import { bodyFor } from "./figure-rig.ts";
import { blockPaletteOf } from "./rider-blocks.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, Stance } from "./rider-figure.ts";

const FULL_TURN = Math.PI * 2;
const WALK_SPEED = 1.3;
const WALK_HZ = 1;
const TAG_LIFT = 1;
const FORWARD_YAW = Math.PI;

const barActs = [
  "lean",
  "arms",
  "phone",
  "stool",
  "ride",
  "tune",
  "walk",
] as const;

type BarAct = (typeof barActs)[number];

const actTurns = {
  arms: poseTurns.arms,
  lean: poseTurns.lean,
  phone: poseTurns.phone,
  ride: [],
  stool: [],
  tune: [],
  walk: poseTurns.relaxed,
} as const;

const STEP_SHARE = 0.46;
const FLOOR_RADIUS = 0.34;
const FACE_SECONDS = 3.5;
const ON_MOUNT_REACH = 3.6;
const AMBIENT_EVERY = 9;
const NOBODY: readonly never[] = [];

const mixPose = (from: number[], to: number[], share: number): number[] => {
  const mixed = [...from];
  for (let offset = 0; offset < mixed.length; offset += 4) {
    THREE.Quaternion.slerpFlat(mixed, offset, from, offset, to, offset, share);
  }
  return mixed;
};

interface CastSpot {
  readonly x: number;
  readonly z: number;
  readonly face: number;
  readonly act: BarAct;
  readonly gather?: readonly [number, number];
}

const spots: readonly CastSpot[] = [
  { act: "ride", face: 0, x: PLINTH.x, z: PLINTH.z },
  { act: "walk", face: -1.9, gather: [1.3, -4.8], x: 4.6, z: 0.4 },
  { act: "lean", face: 0.5, x: -8.4, z: -2.55 },
  { act: "stool", face: 3.14, x: -6.15, z: -2.65 },
  { act: "arms", face: -0.35, x: -0.4, z: -2.6 },
  { act: "tune", face: 0, x: GARAGE_PLINTH.x, z: GARAGE_PLINTH.z },
  { act: "phone", face: 0.9, x: -9.4, z: 3.4 },
];

const STOOL_SEAT = 1;

interface CastMember {
  readonly blocks: RiderBlocks;
  readonly figure: RiderFigure;
  readonly tag: Tag;
  readonly spot: CastSpot;
  readonly head: THREE.Vector3;
}

export interface BarCast extends BarCompany {
  readonly group: THREE.Group;
  readonly update: (
    seconds: number,
    time: number,
    camera: THREE.Camera,
    door: number,
    size: { readonly width: number; readonly height: number },
    ticks: number
  ) => void;
  readonly reset: () => void;
  readonly dispose: () => void;
}

const offsetOf = (index: number): number => index * 1.37;

interface Motion {
  readonly still: number[];
  readonly breath: number[];
  readonly stepA: number[];
  readonly stepB: number[];
}

const turnOff = (figure: RiderFigure, wanted: number): number =>
  THREE.MathUtils.euclideanModulo(
    wanted - figure.root.rotation.y + Math.PI,
    FULL_TURN
  ) - Math.PI;

export const createCast = (
  assets: Assets,
  shading: Shading,
  tags: TagLayer,
  speech: BarSpeech,
  heroBike: THREE.Object3D,
  garageBike: THREE.Object3D,
  shown: number,
  standIns: boolean
): BarCast => {
  const group = new THREE.Group();
  const mounts = new Map<BarAct, THREE.Object3D>([
    ["ride", heroBike],
    ["tune", garageBike],
  ]);
  const members: CastMember[] = [];
  const motions: Motion[] = [];
  const stride = new THREE.Vector3();
  const route = [
    new THREE.Vector3(4.6, 0, 0.4),
    new THREE.Vector3(3, 0, -0.4),
    new THREE.Vector3(-2.5, 0, -1.3),
    new THREE.Vector3(3, 0, -0.4),
  ];
  let leg = 0;
  let pause = 2;
  let walked = 0;
  const pushes = riderBlocks.map(() => ({ pushX: 0, pushZ: 0, x: 0, z: 0 }));
  const faces = riderBlocks.map(() => ({ until: 0, yaw: 0 }));
  for (let index = 0; index < riderBlocks.length; index += 1) {
    const blocks = riderBlocks[index];
    const spot = spots[index];
    if (!(blocks && spot)) {
      continue;
    }
    const figure = createRiderFigure(
      bodyFor(assets, index),
      shading,
      blockPaletteOf(blocks)
    );
    const base =
      spot.act === "stool" || mounts.has(spot.act) ? "seated" : "stand";
    const still = figure.bakePose(base, actTurns[spot.act]);
    const breath = figure.bakePose(base, [
      ...actTurns[spot.act],
      ...breathTurns,
    ]);
    const stepA = mixPose(still, figure.bakePose("run_a", []), STEP_SHARE);
    const stepB = mixPose(still, figure.bakePose("run_b", []), STEP_SHARE);
    motions.push({ breath, stepA, stepB, still });
    group.add(figure.root);
    const onShow = index < shown && (standIns || mounts.has(spot.act));
    figure.root.visible = onShow;
    const tag = tags.name(blocks.name);
    tag.show(onShow);
    members.push({
      blocks,
      figure,
      head: new THREE.Vector3(spot.x, 1.9, spot.z),
      spot,
      tag,
    });
  }
  let lastAmbient = -1;
  const reset = (): void => {
    lastAmbient = -1;
    for (const look of faces) {
      look.until = 0;
    }
    for (const { figure, spot } of members) {
      figure.root.position.set(
        spot.x,
        spot.act === "stool" ? STOOL_SEAT : figure.standHeight,
        spot.z
      );
      figure.root.rotation.y = spot.face + FORWARD_YAW;
    }
    leg = 0;
    pause = 2;
    for (const push of pushes) {
      push.pushX = 0;
      push.pushZ = 0;
    }
  };
  reset();
  const crowd = standIns
    ? members
        .filter(({ spot }) => !mounts.has(spot.act))
        .map(({ figure }) => figure.root.position)
    : [];
  const riding: Stance = {
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
  };

  const rideMount = (
    { figure, head }: CastMember,
    bike: THREE.Object3D,
    seconds: number
  ): void => {
    figure.root.position.copy(bike.position);
    figure.root.quaternion.copy(bike.quaternion);
    figure.root.translateY(figure.seat.y);
    figure.root.translateZ(figure.seat.z);
    figure.animate(riding, seconds);
    head.copy(figure.root.position);
    head.y += 0.9;
  };

  const breathe = (
    figure: RiderFigure,
    motion: Motion,
    index: number,
    time: number,
    seconds: number
  ): void => {
    const blend = 0.5 + 0.5 * Math.sin(time * 0.7 + offsetOf(index));
    figure.holdPose(motion.still, motion.breath, blend, seconds);
  };

  const walkToDoor = (
    figure: RiderFigure,
    motion: Motion,
    gather: readonly [number, number],
    index: number,
    door: number,
    time: number,
    seconds: number
  ): void => {
    stride.set(
      gather[0] - figure.root.position.x,
      0,
      gather[1] - figure.root.position.z
    );
    if (stride.length() > 0.2) {
      figure.root.rotation.y = Math.atan2(stride.x, stride.z) + FORWARD_YAW;
      figure.root.position.addScaledVector(
        stride.normalize(),
        WALK_SPEED * 1.4 * door * seconds
      );
      const phase = time * WALK_HZ * 1.4 + offsetOf(index);
      figure.holdPose(
        motion.stepA,
        motion.stepB,
        0.5 - 0.5 * Math.cos(phase * FULL_TURN),
        seconds
      );
    } else {
      figure.root.rotation.y = FORWARD_YAW + FORWARD_YAW;
      figure.holdPose(motion.still, motion.breath, 0.5, seconds);
    }
  };

  const walkTheRoute = (
    figure: RiderFigure,
    motion: Motion,
    index: number,
    time: number,
    seconds: number
  ): void => {
    const target = route[leg] ?? route[0];
    if (pause > 0 || !target) {
      pause -= seconds;
      breathe(figure, motion, index, time, seconds);
      return;
    }
    stride.set(
      target.x - figure.root.position.x,
      0,
      target.z - figure.root.position.z
    );
    if (stride.length() < 0.1) {
      leg = (leg + 1) % route.length;
      pause = 2.5;
    } else {
      const wanted = Math.atan2(stride.x, stride.z) + FORWARD_YAW;
      figure.root.rotation.y +=
        turnOff(figure, wanted) * Math.min(1, seconds * 5);
      figure.root.position.addScaledVector(
        stride.normalize(),
        WALK_SPEED * seconds
      );
    }
    walked += seconds;
    figure.holdPose(
      motion.stepA,
      motion.stepB,
      0.5 - 0.5 * Math.cos(walked * WALK_HZ * FULL_TURN),
      seconds
    );
  };

  const moveOnFoot = (
    { figure, spot }: CastMember,
    motion: Motion,
    index: number,
    door: number,
    time: number,
    seconds: number
  ): void => {
    if (door > 0 && spot.gather) {
      walkToDoor(figure, motion, spot.gather, index, door, time, seconds);
    } else if (spot.act === "walk" && door === 0) {
      walkTheRoute(figure, motion, index, time, seconds);
    } else {
      breathe(figure, motion, index, time, seconds);
    }
  };

  const carryShove = (
    figure: RiderFigure,
    index: number,
    ticks: number
  ): void => {
    const push = pushes[index];
    if (push && (push.pushX !== 0 || push.pushZ !== 0)) {
      push.x = figure.root.position.x;
      push.z = figure.root.position.z;
      for (let tick = 0; tick < ticks; tick += 1) {
        carryPush(push, FLOOR_RADIUS, NOBODY);
      }
      figure.root.position.x = push.x;
      figure.root.position.z = push.z;
    }
  };

  const turnToLook = (
    figure: RiderFigure,
    index: number,
    time: number,
    seconds: number
  ): void => {
    const look = faces[index];
    if (look && look.until > time) {
      figure.root.rotation.y +=
        turnOff(figure, look.yaw) * Math.min(1, seconds * 7);
    }
  };

  const lookAt = (index: number, x: number, z: number, time: number): void => {
    const member = members[index];
    const look = faces[index];
    if (member && look && !mounts.has(member.spot.act)) {
      const body = member.figure.root.position;
      look.yaw = Math.atan2(x - body.x, z - body.z) + FORWARD_YAW;
      look.until = time + FACE_SECONDS;
    }
  };

  return {
    crowd: () => crowd,
    dispose() {
      for (const { figure } of members) {
        figure.dispose();
      }
    },
    greet(index, x, z, time) {
      const member = members[index];
      if (member) {
        lookAt(index, x, z, time);
        speech.say("SUP", member.head, time);
      }
    },
    group,
    nearest(x, z, reach) {
      let best: number | null = null;
      let closest = Number.POSITIVE_INFINITY;
      for (let index = 0; index < members.length; index += 1) {
        const member = members[index];
        if (member) {
          const away = Math.hypot(member.head.x - x, member.head.z - z);
          const room = mounts.has(member.spot.act) ? ON_MOUNT_REACH : reach;
          if (away < room && away < closest) {
            best = index;
            closest = away;
          }
        }
      }
      return best;
    },
    reset,
    shove(index, x, z, time) {
      const member = members[index];
      const push = pushes[index];
      if (
        member &&
        push &&
        member.spot.act !== "stool" &&
        !mounts.has(member.spot.act)
      ) {
        push.x = member.figure.root.position.x;
        push.z = member.figure.root.position.z;
        shoveRider(push, x, z);
      }
      if (member) {
        lookAt(index, x, z, time);
        speech.say(index % 2 === 0 ? "WATCH IT!" : "OI!", member.head, time);
      }
    },
    spotOf: (index) => members[index]?.figure.root.position ?? null,
    update(seconds, time, camera, door, size, ticks) {
      for (let index = 0; index < members.length; index += 1) {
        const member = members[index];
        const motion = motions[index];
        if (member && motion) {
          const bike = mounts.get(member.spot.act);
          if (bike) {
            rideMount(member, bike, seconds);
          } else {
            moveOnFoot(member, motion, index, door, time, seconds);
            carryShove(member.figure, index, ticks);
            turnToLook(member.figure, index, time, seconds);
            member.head.copy(member.figure.root.position);
            member.head.y += member.spot.act === "stool" ? 1.02 : TAG_LIFT;
          }
          member.tag.set(member.head, camera, size);
        }
      }
      const ambient = Math.floor(time / AMBIENT_EVERY);
      if (standIns && ambient !== lastAmbient && door === 0) {
        lastAmbient = ambient;
        const speaker = members[(ambient * 3 + 1) % members.length];
        if (speaker) {
          speech.ambient(ambient, speaker.head, time);
        }
      }
    },
  };
};
