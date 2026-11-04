import * as THREE from "three";

import type { Assets } from "./assets.ts";
import { blockPaletteOf, riderBlocks } from "./bar-blocks.ts";
import type { RiderBlocks } from "./bar-blocks.ts";
import { PLINTH } from "./bar-room.ts";
import type { Tag, TagLayer } from "./bar-tags.ts";
import type { Shading } from "./cel.ts";
import type { Turn } from "./figure-pose.ts";
import { bodyFor } from "./figure-rig.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, Stance } from "./rider-figure.ts";

const FORWARD = new THREE.Vector3(-1, 0, 0);
const RAISE = new THREE.Vector3(1, 0, 0);
const ROLL = new THREE.Vector3(0, 0, 1);
const YAW = new THREE.Vector3(0, 1, 0);

const FULL_TURN = Math.PI * 2;
const WALK_SPEED = 1.3;
const WALK_HZ = 1;
const TAG_LIFT = 1;
const FORWARD_YAW = Math.PI;

const barActs = [
  "stand",
  "lean",
  "arms",
  "phone",
  "stool",
  "chat",
  "ride",
  "walk",
] as const;

type BarAct = (typeof barActs)[number];

const relaxed: readonly Turn[] = [
  { axis: RAISE, bone: "lowerarm_l", degrees: 16 },
  { axis: RAISE, bone: "lowerarm_r", degrees: 16 },
  { axis: ROLL, bone: "upperarm_l", degrees: -5 },
  { axis: ROLL, bone: "upperarm_r", degrees: 5 },
];

const actTurns = {
  arms: [
    { axis: RAISE, bone: "upperarm_l", degrees: 16 },
    { axis: RAISE, bone: "upperarm_r", degrees: 16 },
    { axis: ROLL, bone: "upperarm_l", degrees: -12 },
    { axis: ROLL, bone: "upperarm_r", degrees: 12 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 82 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 90 },
    { axis: YAW, bone: "lowerarm_l", degrees: -72 },
    { axis: YAW, bone: "lowerarm_r", degrees: 72 },
    { axis: FORWARD, bone: "spine_03", degrees: -4 },
  ],
  chat: [
    { axis: RAISE, bone: "upperarm_r", degrees: 32 },
    { axis: ROLL, bone: "upperarm_r", degrees: 12 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 62 },
    { axis: YAW, bone: "lowerarm_r", degrees: -24 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 16 },
    { axis: ROLL, bone: "upperarm_l", degrees: -6 },
    { axis: YAW, bone: "spine_03", degrees: 10 },
  ],
  lean: [
    { axis: ROLL, bone: "pelvis", degrees: 5 },
    { axis: FORWARD, bone: "spine_01", degrees: -6 },
    { axis: FORWARD, bone: "spine_02", degrees: -6 },
    { axis: RAISE, bone: "upperarm_l", degrees: -34 },
    { axis: RAISE, bone: "upperarm_r", degrees: -34 },
    { axis: ROLL, bone: "upperarm_l", degrees: -18 },
    { axis: ROLL, bone: "upperarm_r", degrees: 18 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 36 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 36 },
    { axis: FORWARD, bone: "head", degrees: 4 },
  ],
  phone: [
    { axis: RAISE, bone: "upperarm_r", degrees: 26 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 92 },
    { axis: YAW, bone: "lowerarm_r", degrees: 34 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 18 },
    { axis: ROLL, bone: "upperarm_l", degrees: -5 },
    { axis: FORWARD, bone: "neck_01", degrees: 12 },
    { axis: FORWARD, bone: "head", degrees: 14 },
    { axis: YAW, bone: "head", degrees: 8 },
  ],
  ride: [],
  stand: relaxed,
  stool: [],
  walk: relaxed,
} as const satisfies Record<BarAct, readonly Turn[]>;

const breathTurns: readonly Turn[] = [
  { axis: FORWARD, bone: "spine_02", degrees: 1.6 },
  { axis: FORWARD, bone: "spine_03", degrees: 1.3 },
  { axis: ROLL, bone: "spine_01", degrees: 1.4 },
  { axis: YAW, bone: "neck_01", degrees: 11 },
  { axis: YAW, bone: "head", degrees: 9 },
];

const STEP_SHARE = 0.46;

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
  { act: "chat", face: 0.9, gather: [1.8, -6], x: 3.3, z: 6.9 },
  { act: "lean", face: 0.5, x: -8.4, z: -2.55 },
  { act: "stool", face: 3.14, x: -6.15, z: -2.65 },
  { act: "arms", face: -0.35, x: 0.6, z: -2.2 },
  { act: "walk", face: -1.9, gather: [7.1, -6.6], x: 7.6, z: 3 },
  { act: "phone", face: 0.9, x: -9.4, z: 3.4 },
  { act: "stand", face: 3.14, x: 6, z: -5.2 },
];

const STOOL_SEAT = 1;

interface CastMember {
  readonly blocks: RiderBlocks;
  readonly figure: RiderFigure;
  readonly tag: Tag;
  readonly spot: CastSpot;
  readonly head: THREE.Vector3;
}

export interface BarCast {
  readonly members: readonly CastMember[];
  readonly group: THREE.Group;
  readonly update: (
    seconds: number,
    time: number,
    camera: THREE.Camera,
    door: number,
    size: { readonly width: number; readonly height: number }
  ) => void;
  readonly reset: () => void;
  readonly dispose: () => void;
}

const offsetOf = (index: number): number => index * 1.37;

export const createCast = (
  assets: Assets,
  shading: Shading,
  tags: TagLayer,
  bubbleLines: readonly string[],
  heroBike: THREE.Object3D,
  shown: number
): BarCast => {
  const group = new THREE.Group();
  const members: CastMember[] = [];
  const motions: {
    readonly still: number[];
    readonly breath: number[];
    readonly stepA: number[];
    readonly stepB: number[];
  }[] = [];
  const stride = new THREE.Vector3();
  const route = [
    new THREE.Vector3(7.6, 0, 3),
    new THREE.Vector3(3, 0, -0.4),
    new THREE.Vector3(-2.5, 0, -1.3),
    new THREE.Vector3(3, 0, -0.4),
  ];
  let leg = 0;
  let pause = 2;
  let walked = 0;
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
      spot.act === "stool" || spot.act === "ride" ? "seated" : "stand";
    const still = figure.bakePose(base, actTurns[spot.act]);
    const breath = figure.bakePose(base, [
      ...actTurns[spot.act],
      ...breathTurns,
    ]);
    const stepA = mixPose(still, figure.bakePose("run_a", []), STEP_SHARE);
    const stepB = mixPose(still, figure.bakePose("run_b", []), STEP_SHARE);
    motions.push({ breath, stepA, stepB, still });
    group.add(figure.root);
    figure.root.visible = index < shown;
    const tag = tags.name(blocks.name);
    tag.show(index < shown);
    members.push({
      blocks,
      figure,
      head: new THREE.Vector3(spot.x, 1.9, spot.z),
      spot,
      tag,
    });
  }
  const reset = (): void => {
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
  };
  reset();
  const bubbles = bubbleLines.map((line) => {
    const tag = tags.bubble(line);
    tag.show(false);
    return tag;
  });
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

  return {
    dispose() {
      for (const { figure } of members) {
        figure.dispose();
      }
    },
    group,
    members,
    reset,
    update(seconds, time, camera, door, size) {
      for (let index = 0; index < members.length; index += 1) {
        const member = members[index];
        const motion = motions[index];
        if (!(member && motion)) {
          continue;
        }
        const { figure, spot, tag } = member;
        if (spot.act === "ride") {
          figure.root.position.copy(heroBike.position);
          figure.root.quaternion.copy(heroBike.quaternion);
          figure.root.translateY(figure.seat.y);
          figure.root.translateZ(figure.seat.z);
          figure.animate(riding, seconds);
          member.head.copy(figure.root.position);
          member.head.y += 0.9;
        } else {
          const gather = door > 0 ? spot.gather : undefined;
          if (gather) {
            stride.set(
              gather[0] - figure.root.position.x,
              0,
              gather[1] - figure.root.position.z
            );
            if (stride.length() > 0.2) {
              figure.root.rotation.y =
                Math.atan2(stride.x, stride.z) + FORWARD_YAW;
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
          } else if (spot.act === "walk" && door === 0) {
            const target = route[leg] ?? route[0];
            if (pause > 0 || !target) {
              pause -= seconds;
              const blend = 0.5 + 0.5 * Math.sin(time * 0.7 + offsetOf(index));
              figure.holdPose(motion.still, motion.breath, blend, seconds);
            } else {
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
                const off =
                  THREE.MathUtils.euclideanModulo(
                    wanted - figure.root.rotation.y + Math.PI,
                    FULL_TURN
                  ) - Math.PI;
                figure.root.rotation.y += off * Math.min(1, seconds * 5);
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
            }
          } else {
            const blend = 0.5 + 0.5 * Math.sin(time * 0.7 + offsetOf(index));
            figure.holdPose(motion.still, motion.breath, blend, seconds);
          }
          member.head.copy(figure.root.position);
          member.head.y += spot.act === "stool" ? 1.02 : TAG_LIFT;
        }
        tag.set(member.head, camera, size);
      }
      const spoken = Math.floor(time / 4.5) % bubbles.length;
      for (let index = 0; index < bubbles.length; index += 1) {
        const bubble = bubbles[index];
        const speaker = members[(index * 3 + 1) % members.length];
        if (bubble && speaker) {
          bubble.show(index === spoken && door === 0);
          bubble.set(speaker.head, camera, size);
        }
      }
    },
  };
};
