import * as THREE from "three";

import {
  leanToward,
  placeChain,
  reachFor,
  reachOf,
  swingGirdle,
  turnInWorld,
  writeLocal,
} from "./figure-ik.ts";
import type { Chain, Grip, Joint, Limb } from "./figure-ik.ts";
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
const GIRDLE_SWING = THREE.MathUtils.degToRad(18);
const TORSO_LEAN = THREE.MathUtils.degToRad(29);

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

export const risenTurns = (side: number): readonly Turn[] => [
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

type Planted = "all" | "freeArm" | "freeLeg" | "none";

const plantedIn = (pose: RiderPose): Planted => {
  switch (pose) {
    case "seated": {
      return "all";
    }
    case "punch":
    case "windup":
    case "swing":
    case "swung": {
      return "freeArm";
    }
    case "kick": {
      return "freeLeg";
    }
    case "tumble":
    case "lying":
    case "run":
    case "stand":
    case "lift":
    case "surrender": {
      return "none";
    }
    default: {
      return pose satisfies never;
    }
  }
};

export interface Planter {
  readonly plant: (
    pose: number[],
    lift: THREE.Vector3,
    stance: RiderPose,
    side: number
  ) => void;
}

const boneNamed = (rig: Rig, name: string): THREE.Bone => {
  const bone = rig.skeleton.getBoneByName(name);
  if (!bone) {
    throw new Error(`The rider model has no ${name} bone.`);
  }
  return bone;
};

const chainOf = (rig: Rig, ends: readonly string[]): Chain => {
  const joints = new Map<THREE.Bone, Joint>();
  const jointOf = (bone: THREE.Bone): Joint => {
    const known = joints.get(bone);
    if (known) {
      return known;
    }
    const above = rig.bones.find(
      (each) => each !== undefined && each === bone.parent
    );
    const joint: Joint = {
      at: new THREE.Vector3(),
      index: rig.bones.indexOf(bone),
      offset: bone.position.clone(),
      parent: above ? jointOf(above) : null,
      turn: new THREE.Quaternion(),
    };
    joints.set(bone, joint);
    return joint;
  };
  for (const end of ends) {
    jointOf(boneNamed(rig, end));
  }
  const top = [...joints.keys()].find((bone) => !joints.get(bone)?.parent);
  if (!top?.parent) {
    throw new Error("The rider model has no skeleton root.");
  }
  rig.root.updateMatrixWorld(true);
  const baseAt = new THREE.Vector3();
  const baseTurn = new THREE.Quaternion();
  rig.root.matrixWorld
    .clone()
    .invert()
    .multiply(top.parent.matrixWorld)
    .decompose(baseAt, baseTurn, new THREE.Vector3());
  return { baseAt, baseTurn, joints: [...joints.values()] };
};

const descends = (joint: Joint, from: Joint): boolean =>
  joint === from || (joint.parent !== null && descends(joint.parent, from));

const gripOf = (limb: Limb): Grip => ({
  at: limb.bones[2].at.clone(),
  facing: limb.bones[2].turn.clone(),
  limb,
  reach: reachOf(limb),
});

export const planterOf = (rig: Rig, seated: readonly number[]): Planter => {
  const chain = chainOf(rig, ["hand_l", "hand_r", "foot_l", "foot_r"]);
  const jointNamed = (name: string): Joint => {
    const index = rig.bones.indexOf(boneNamed(rig, name));
    const joint = chain.joints.find((each) => each.index === index);
    if (!joint) {
      throw new Error(`The rider model's ${name} bone holds no grip.`);
    }
    return joint;
  };
  const limbOf = (
    upper: string,
    lower: string,
    end: string,
    girdle: string | null
  ): Grip =>
    gripOf({
      bones: [jointNamed(upper), jointNamed(lower), jointNamed(end)],
      girdle: girdle === null ? null : jointNamed(girdle),
    });
  const torso = jointNamed("spine_01");
  const above = chain.joints.filter((joint) => descends(joint, torso));
  placeChain(chain, seated, new THREE.Vector3());
  const arms = {
    left: limbOf("upperarm_l", "lowerarm_l", "hand_l", "clavicle_l"),
    right: limbOf("upperarm_r", "lowerarm_r", "hand_r", "clavicle_r"),
  };
  const legs = {
    left: limbOf("thigh_l", "calf_l", "foot_l", null),
    right: limbOf("thigh_r", "calf_r", "foot_r", null),
  };
  const every = [arms.left, arms.right, legs.left, legs.right];
  const without = (free: Grip) => every.filter((grip) => grip !== free);
  const held = {
    all: { left: every, right: every },
    freeArm: { left: without(arms.left), right: without(arms.right) },
    freeLeg: { left: without(legs.left), right: without(legs.right) },
    none: { left: [], right: [] },
  } satisfies Record<Planted, Sided<readonly Grip[]>>;
  return {
    plant(pose, lift, stance, side) {
      const grips = sideOf(held[plantedIn(stance)], side);
      if (grips.length === 0) {
        return;
      }
      placeChain(chain, pose, lift);
      for (const grip of grips) {
        swingGirdle(grip, GIRDLE_SWING);
      }
      leanToward(torso, above, PITCH_FORWARD, grips, TORSO_LEAN);
      writeLocal(chain, pose, torso);
      for (const grip of grips) {
        reachFor(grip);
        const { bones, girdle } = grip.limb;
        if (girdle) {
          writeLocal(chain, pose, girdle);
        }
        for (const joint of bones) {
          writeLocal(chain, pose, joint);
        }
      }
    },
  };
};
