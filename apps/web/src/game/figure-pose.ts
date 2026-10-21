import * as THREE from "three";

import { reachFor, turnInWorld } from "./figure-ik.ts";
import { posed, read } from "./figure-rig.ts";
import type { Rig } from "./figure-rig.ts";

export type RiderPose =
  | "seated"
  | "tumble"
  | "lying"
  | "run"
  | "stand"
  | "lift"
  | "punch"
  | "kick"
  | "windup"
  | "swing"
  | "swung"
  | "surrender";

const PITCH_FORWARD = new THREE.Vector3(-1, 0, 0);
const ROLL = new THREE.Vector3(0, 0, 1);
const RISE_LIFT = 0.13;
const RISE_SHIFT = 0.07;
const RISE_FORWARD = 0.04;

export interface Turn {
  readonly bone: string;
  readonly axis: THREE.Vector3;
  readonly degrees: number;
}

export const TUCK_TURNS: readonly Turn[] = [
  { axis: PITCH_FORWARD, bone: "spine_01", degrees: 9 },
  { axis: PITCH_FORWARD, bone: "spine_02", degrees: 11 },
  { axis: PITCH_FORWARD, bone: "spine_03", degrees: 9 },
  { axis: PITCH_FORWARD, bone: "neck_01", degrees: -10 },
  { axis: PITCH_FORWARD, bone: "head", degrees: -12 },
  { axis: PITCH_FORWARD, bone: "upperarm_l", degrees: -22 },
  { axis: PITCH_FORWARD, bone: "upperarm_r", degrees: -22 },
  { axis: ROLL, bone: "upperarm_l", degrees: 16 },
  { axis: ROLL, bone: "upperarm_r", degrees: -16 },
  { axis: PITCH_FORWARD, bone: "lowerarm_l", degrees: 14 },
  { axis: PITCH_FORWARD, bone: "lowerarm_r", degrees: 14 },
];

export const hangTurns = (side: number): readonly Turn[] => [
  { axis: ROLL, bone: "spine_01", degrees: -7 * side },
  { axis: ROLL, bone: "spine_02", degrees: -6 * side },
  { axis: ROLL, bone: "spine_03", degrees: -5 * side },
  { axis: ROLL, bone: "neck_01", degrees: 4 * side },
  { axis: ROLL, bone: "head", degrees: 5 * side },
];

export const flinchTurns = (side: number): readonly Turn[] => [
  { axis: ROLL, bone: "spine_02", degrees: -9 * side },
  { axis: ROLL, bone: "spine_03", degrees: -8 * side },
  { axis: ROLL, bone: "head", degrees: -10 * side },
  { axis: PITCH_FORWARD, bone: "neck_01", degrees: -8 },
  { axis: PITCH_FORWARD, bone: "head", degrees: -10 },
];

const risenTurns = (side: number): readonly Turn[] => [
  { axis: PITCH_FORWARD, bone: "spine_01", degrees: -8 },
  { axis: PITCH_FORWARD, bone: "spine_02", degrees: -6 },
  { axis: PITCH_FORWARD, bone: "neck_01", degrees: 6 },
  { axis: PITCH_FORWARD, bone: "head", degrees: 6 },
  { axis: ROLL, bone: "pelvis", degrees: 6 * side },
  { axis: ROLL, bone: "spine_01", degrees: 8 * side },
  { axis: ROLL, bone: "spine_02", degrees: 7 * side },
  { axis: ROLL, bone: "spine_03", degrees: 5 * side },
  { axis: ROLL, bone: "neck_01", degrees: -10 * side },
  { axis: ROLL, bone: "head", degrees: -10 * side },
];

export const riseOffset = (side: number): THREE.Vector3 =>
  new THREE.Vector3(side * RISE_SHIFT, RISE_LIFT, -RISE_FORWARD);

interface Limb {
  readonly upper: string;
  readonly lower: string;
  readonly end: string;
}

const PLANTED: readonly Limb[] = ["_l", "_r"].flatMap((suffix) => [
  { end: `foot${suffix}`, lower: `calf${suffix}`, upper: `thigh${suffix}` },
  {
    end: `hand${suffix}`,
    lower: `lowerarm${suffix}`,
    upper: `upperarm${suffix}`,
  },
]);

const kickingLeg = (side: number): readonly string[] => {
  const suffix = side < 0 ? "_l" : "_r";
  return ["thigh", "calf", "foot", "ball"].map((bone) => `${bone}${suffix}`);
};

export const turnedFrom = (
  rig: Rig,
  base: readonly number[],
  turns: readonly Turn[]
): number[] => {
  posed(rig, base);
  for (const { axis, bone: name, degrees } of turns) {
    const bone = rig.skeleton.getBoneByName(name);
    if (bone) {
      turnInWorld(
        bone,
        new THREE.Quaternion().setFromAxisAngle(
          axis,
          THREE.MathUtils.degToRad(degrees)
        )
      );
    }
  }
  return read(rig, [...base]);
};

export const risenFrom = (
  rig: Rig,
  seated: readonly number[],
  side: number
): number[] => {
  posed(rig, seated);
  const lift = riseOffset(side);
  const grips = PLANTED.flatMap((limb) => {
    const end = rig.skeleton.getBoneByName(limb.end);
    return end
      ? [
          {
            facing: end.getWorldQuaternion(new THREE.Quaternion()),
            limb,
            target: end.getWorldPosition(new THREE.Vector3()).sub(lift),
          },
        ]
      : [];
  });
  turnedFrom(rig, seated, risenTurns(side));
  for (const { facing, limb, target } of grips) {
    const upper = rig.skeleton.getBoneByName(limb.upper);
    const lower = rig.skeleton.getBoneByName(limb.lower);
    const end = rig.skeleton.getBoneByName(limb.end);
    if (upper && lower && end) {
      reachFor(upper, lower, end, target, facing);
    }
  }
  return read(rig, [...seated]);
};

export const kickedFrom = (
  rig: Rig,
  risen: readonly number[],
  kick: readonly number[],
  side: number
): number[] => {
  const kicked = [...risen];
  for (const name of kickingLeg(side)) {
    const index = rig.names.indexOf(name);
    if (index !== -1) {
      kicked.splice(index * 4, 4, ...kick.slice(index * 4, index * 4 + 4));
    }
  }
  return kicked;
};

export interface Sided<T> {
  readonly left: T;
  readonly right: T;
}

export interface Riding {
  readonly seated: number[];
  readonly tucked: number[];
  readonly hang: Sided<number[]>;
  readonly tuckedHang: Sided<number[]>;
  readonly flinch: Sided<number[]>;
  readonly risen: Sided<number[]>;
  readonly kicked: Sided<number[]>;
}

export const sideOf = <T>(sided: Sided<T>, side: number): T =>
  side < 0 ? sided.left : sided.right;
