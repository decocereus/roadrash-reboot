import * as THREE from "three";

import { bareDeck } from "./bike-deck.ts";
import type { BikeDeck } from "./bike-deck.ts";
import { contactNames } from "./bike-fit.ts";
import type { BikeFit, ContactName } from "./bike-fit.ts";
import type { BikePosture } from "./bike-posture.ts";
import type { ChestPoint } from "./figure-chest.ts";
import type { Contacts } from "./figure-contacts.ts";
import {
  leanToward,
  placeChain,
  reachFor,
  reachOf,
  swingGirdle,
  swingKneeOut,
  turnAbove,
  turnInWorld,
  writeLocal,
} from "./figure-ik.ts";
import type { Chain, Grip, Joint, Limb } from "./figure-ik.ts";
import { boneNamed, posed, read } from "./figure-rig.ts";
import type { Rig } from "./figure-rig.ts";

export type RiderPose =
  | "seated"
  | "tumble"
  | "lying"
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

const pitchShares = [
  ["spine_01", 0.3],
  ["spine_02", 0.4],
  ["spine_03", 0.3],
  ["neck_01", -0.4],
  ["head", -0.4],
] as const;

const pitchedBy = (pitch: number): Turn[] =>
  pitchShares.map(([bone, share]) => ({
    axis: PITCH_FORWARD,
    bone,
    degrees: share * pitch,
  }));

const TUCKED_ARMS: readonly Turn[] = [
  { axis: PITCH_FORWARD, bone: "upperarm_l", degrees: -22 },
  { axis: PITCH_FORWARD, bone: "upperarm_r", degrees: -22 },
  { axis: ROLL, bone: "upperarm_l", degrees: 16 },
  { axis: ROLL, bone: "upperarm_r", degrees: -16 },
  { axis: PITCH_FORWARD, bone: "lowerarm_l", degrees: 14 },
  { axis: PITCH_FORWARD, bone: "lowerarm_r", degrees: 14 },
];

export const restTurns = ({ restPitch }: BikePosture): readonly Turn[] =>
  pitchedBy(restPitch);

export const tuckTurns = (
  { tuckPitch }: BikePosture,
  elbowsIn = 1
): readonly Turn[] => [
  ...pitchedBy(tuckPitch),
  ...TUCKED_ARMS.map((turn) =>
    turn.axis === ROLL ? { ...turn, degrees: turn.degrees * elbowsIn } : turn
  ),
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
  readonly seatOn: (
    fit: BikeFit,
    contacts: Contacts,
    seated: readonly number[],
    hip: THREE.Vector3
  ) => void;
  readonly plant: (
    pose: number[],
    lift: THREE.Vector3,
    stance: RiderPose,
    side: number,
    lean: number,
    speed: number
  ) => void;
  readonly settle: (pose: number[], lift: THREE.Vector3, lie: boolean) => void;
  readonly sinkOf: (
    pose: readonly number[],
    lift: THREE.Vector3,
    part: BodyPart
  ) => number;
  readonly reachShortOf: (
    pose: readonly number[],
    lift: THREE.Vector3
  ) => number;
}

const KMH = 3.6;
const FOOT_DOWN_FULL_SPEED = 35 / KMH;
const FOOT_DOWN_END_SPEED = 50 / KMH;
const FOOT_DOWN_FROM = 0.1;
const FOOT_DOWN_FULL = 0.28;
const FOOT_SIDE = 0.28;
const FOOT_DROP = 0.26;
const FOOT_FORWARD = 0.1;
const KNEE_START_SPEED = 50 / KMH;
const KNEE_FULL_SPEED = 75 / KMH;
const KNEE_OUT_FROM = 0.25;
const KNEE_OUT_FULL = 0.85;
const KNEE_SWING = THREE.MathUtils.degToRad(55);
const KNEE_SCRAPE = 0.92;
export const HANG_SHIFT = 0.13;
const KNEE_FORWARD = new THREE.Vector3(0, 0, -1);
const origin = new THREE.Vector3();
const reaching = new THREE.Vector3();
const ARM_STRETCH = 0.96;
const footTarget = new THREE.Vector3();
const chestAt = new THREE.Vector3();
const pulled = new THREE.Vector3();

const CHEST_CLEAR = 0.004;
const SETTLE_PASSES = 8;
const SETTLED_TIP = THREE.MathUtils.degToRad(0.05);
const SHORTEST_LEVER = 0.05;

const footDown = (lean: number, speed: number): number =>
  (1 -
    THREE.MathUtils.smoothstep(
      speed,
      FOOT_DOWN_FULL_SPEED,
      FOOT_DOWN_END_SPEED
    )) *
  THREE.MathUtils.smoothstep(Math.abs(lean), FOOT_DOWN_FROM, FOOT_DOWN_FULL);

export const kneeOut = (lean: number, speed: number): number =>
  THREE.MathUtils.smoothstep(speed, KNEE_START_SPEED, KNEE_FULL_SPEED) *
  THREE.MathUtils.smoothstep(Math.abs(lean), KNEE_OUT_FROM, KNEE_OUT_FULL);

export const kneeScrapes = (lean: number, speed: number): boolean =>
  speed >= KNEE_FULL_SPEED && Math.abs(lean) >= KNEE_SCRAPE;

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
    jointOf(boneNamed(rig.skeleton, end));
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

const gripOf = (limb: Limb, stretch: number): Grip => ({
  at: limb.bones[2].at.clone(),
  facing: limb.bones[2].turn.clone(),
  limb,
  reach: reachOf(limb) * stretch,
});

export type BodyPart = "chest" | "forearms";

export const planterOf = (
  rig: Rig,
  seated: readonly number[],
  bodyPoints: Readonly<Record<BodyPart, readonly ChestPoint[]>>
): Planter => {
  const chain = chainOf(rig, ["hand_l", "hand_r", "foot_l", "foot_r", "head"]);
  const jointNamed = (name: string): Joint => {
    const index = rig.bones.indexOf(boneNamed(rig.skeleton, name));
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
    gripOf(
      {
        bones: [jointNamed(upper), jointNamed(lower), jointNamed(end)],
        girdle: girdle === null ? null : jointNamed(girdle),
      },
      girdle === null ? 1 : ARM_STRETCH
    );
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
  const reachingArms = [arms.left, arms.right];
  const onChain = (points: readonly ChestPoint[]) =>
    points.flatMap(({ give, pulls }) => {
      const held = pulls.flatMap(({ at, bone, weight }) => {
        const joint = chain.joints.find((each) => each.index === bone);
        return joint ? [{ at, joint, weight }] : [];
      });
      const total = held.reduce((sum, { weight }) => sum + weight, 0);
      return total > 0
        ? [
            {
              give,
              pulls: held.map((pull) => ({
                ...pull,
                weight: pull.weight / total,
              })),
            },
          ]
        : [];
    });
  const parts = {
    chest: onChain(bodyPoints.chest),
    forearms: onChain(bodyPoints.forearms),
  };
  const { chest } = parts;
  const chestPointAt = (point: (typeof chest)[number]) => {
    chestAt.set(0, 0, 0);
    for (const { at, joint, weight } of point.pulls) {
      pulled.copy(at).applyQuaternion(joint.turn).add(joint.at);
      chestAt.addScaledVector(pulled, weight);
    }
    return chestAt;
  };
  let deck: BikeDeck = bareDeck;
  const seat = new THREE.Vector3();
  const placedAt = (pose: readonly number[], lift: THREE.Vector3) => {
    placeChain(chain, pose, lift);
    for (const arm of reachingArms) {
      swingGirdle(arm, GIRDLE_SWING);
    }
    leanToward(torso, above, PITCH_FORWARD, reachingArms, TORSO_LEAN);
    for (const arm of reachingArms) {
      reachFor(arm);
    }
  };
  const tipFor = (lie: boolean): number => {
    let back = 0;
    let down = Infinity;
    for (const point of chest) {
      chestPointAt(point);
      const floor =
        deck.heightAt(chestAt.x + seat.x, chestAt.z + seat.z) - seat.y;
      const gap = chestAt.y - floor - CHEST_CLEAR + point.give;
      const lever = torso.at.z - chestAt.z;
      if (lever > SHORTEST_LEVER) {
        const turn = Math.atan2(gap, lever);
        back = Math.min(back, turn);
        down = Math.min(down, turn);
      }
    }
    return back < 0 || !lie || down === Infinity ? back : down;
  };
  const every = [...reachingArms, legs.left, legs.right];
  const byContact = {
    foot_l: legs.left,
    foot_r: legs.right,
    hand_l: arms.left,
    hand_r: arms.right,
  } satisfies Record<ContactName, Grip>;
  const without = (free: Grip) => every.filter((grip) => grip !== free);
  const held = {
    all: { left: every, right: every },
    freeArm: { left: without(arms.left), right: without(arms.right) },
    freeLeg: { left: without(legs.left), right: without(legs.right) },
    none: { left: [], right: [] },
  } satisfies Record<Planted, Sided<readonly Grip[]>>;
  return {
    plant(pose, lift, stance, side, lean, speed) {
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
      const inside = lean < 0 ? legs.left : legs.right;
      const foot = footDown(lean, speed);
      const knee = kneeOut(lean, speed);
      for (const grip of grips) {
        if (grip === inside && foot > 0) {
          footTarget.set(
            grip.at.x + Math.sign(grip.at.x) * FOOT_SIDE * foot,
            grip.at.y - FOOT_DROP * foot,
            grip.at.z - FOOT_FORWARD * foot
          );
          reachFor(grip, footTarget);
        } else {
          reachFor(grip);
        }
        if (grip === inside && knee > 0) {
          swingKneeOut(grip, KNEE_FORWARD, KNEE_SWING * knee);
        }
        const { bones, girdle } = grip.limb;
        if (girdle) {
          writeLocal(chain, pose, girdle);
        }
        for (const joint of bones) {
          writeLocal(chain, pose, joint);
        }
      }
    },
    reachShortOf(pose, lift) {
      placedAt(pose, lift);
      let short = -Infinity;
      for (const arm of reachingArms) {
        short = Math.max(
          short,
          arm.at.distanceTo(arm.limb.bones[0].at) - arm.reach
        );
      }
      return short;
    },
    seatOn(fit, contacts, seatedOn, hip) {
      placeChain(chain, seatedOn, origin);
      for (const name of contactNames) {
        const grip = byContact[name];
        grip.facing.copy(grip.limb.bones[2].turn);
        grip.at
          .copy(contacts[name])
          .applyQuaternion(grip.facing)
          .negate()
          .add(fit[name])
          .sub(fit.seat);
      }
      leanToward(torso, above, PITCH_FORWARD, reachingArms, TORSO_LEAN);
      let slide = 0;
      for (const arm of reachingArms) {
        reaching.subVectors(arm.at, arm.limb.bones[0].at);
        const room = arm.reach ** 2 - reaching.x ** 2 - reaching.y ** 2;
        if (room > 0) {
          slide = Math.max(slide, -reaching.z - Math.sqrt(room));
        }
      }
      hip.copy(fit.seat);
      hip.z -= slide;
      for (const grip of every) {
        grip.at.z += slide;
      }
      ({ deck } = fit);
      seat.copy(hip);
    },
    settle(pose, lift, lie) {
      for (let pass = 0; pass < SETTLE_PASSES; pass += 1) {
        placedAt(pose, lift);
        const tip = tipFor(lie);
        if (Math.abs(tip) < SETTLED_TIP) {
          return;
        }
        placeChain(chain, pose, lift);
        turnAbove(torso, above, PITCH_FORWARD, tip);
        writeLocal(chain, pose, torso);
      }
    },
    sinkOf(pose, lift, part) {
      placedAt(pose, lift);
      let sink = -Infinity;
      for (const point of parts[part]) {
        chestPointAt(point);
        sink = Math.max(
          sink,
          deck.heightAt(chestAt.x + seat.x, chestAt.z + seat.z) -
            seat.y -
            chestAt.y -
            point.give
        );
      }
      return sink;
    },
  };
};
