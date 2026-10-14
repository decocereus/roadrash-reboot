import { riderPalette } from "@racer/sim/palette";
import type { WeaponKind } from "@racer/sim/state";
import * as THREE from "three";
import { clone as cloneRig } from "three/addons/utils/SkeletonUtils.js";

import { paintPrimitives } from "./assets.ts";
import type { Assets, Palette, PoseName, RiderAsset } from "./assets.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";

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

export interface Stance {
  pose: RiderPose;
  time: number;
  side: number;
  weapon: WeaponKind;
  tuck: number;
  lean: number;
  reach: number;
  flinch: number;
  flinchSide: number;
}

const DEFAULT_JACKET = 0x23_26_2c;
const DEFAULT_HELMET = 0xf2_c2_30;
const SUIT_PANEL = "#1c1826";
const BLEND_RATE = 16;
const RUN_HZ = 2.6;
const TUMBLE_HZ = 1.75;
const FULL_TURN = Math.PI * 2;
const PITCH_FORWARD = new THREE.Vector3(-1, 0, 0);
const ROLL = new THREE.Vector3(0, 0, 1);

interface Turn {
  readonly bone: string;
  readonly axis: THREE.Vector3;
  readonly degrees: number;
}

const TUCK_TURNS: readonly Turn[] = [
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

const hangTurns = (side: number): readonly Turn[] => [
  { axis: ROLL, bone: "spine_01", degrees: -7 * side },
  { axis: ROLL, bone: "spine_02", degrees: -6 * side },
  { axis: ROLL, bone: "spine_03", degrees: -5 * side },
  { axis: ROLL, bone: "neck_01", degrees: 4 * side },
  { axis: ROLL, bone: "head", degrees: 5 * side },
];

const flinchTurns = (side: number): readonly Turn[] => [
  { axis: ROLL, bone: "spine_02", degrees: -9 * side },
  { axis: ROLL, bone: "spine_03", degrees: -8 * side },
  { axis: ROLL, bone: "head", degrees: -10 * side },
  { axis: PITCH_FORWARD, bone: "neck_01", degrees: -8 },
  { axis: PITCH_FORWARD, bone: "head", degrees: -10 },
];

export interface RiderFigure {
  readonly root: THREE.Group;
  readonly seat: THREE.Vector3;
  readonly standHeight: number;
  dispose: () => void;
  animate: (stance: Stance, seconds: number) => void;
}

const striking = (pose: RiderPose): boolean =>
  pose === "punch" ||
  pose === "kick" ||
  pose === "windup" ||
  pose === "swing" ||
  pose === "swung";

const sidedName = (left: PoseName, right: PoseName, side: number): PoseName =>
  side < 0 ? left : right;

const strikeName = (pose: RiderPose, side: number): PoseName => {
  if (pose === "punch") {
    return sidedName("punch_l", "punch_r", side);
  }
  if (pose === "kick") {
    return sidedName("kick_l", "kick_r", side);
  }
  if (pose === "windup") {
    return sidedName("windup_l", "windup_r", side);
  }
  return sidedName("swing_l", "swing_r", side);
};

const cycleFor = (
  pose: RiderPose,
  time: number
): readonly [PoseName, PoseName, number] => {
  if (pose === "run") {
    return ["run_a", "run_b", 0.5 - 0.5 * Math.cos(time * RUN_HZ * FULL_TURN)];
  }
  if (pose === "stand") {
    return ["run_a", "run_b", 0.5];
  }
  if (pose === "tumble") {
    return [
      "tumble_a",
      "tumble_b",
      0.5 + 0.5 * Math.sin(time * TUMBLE_HZ * FULL_TURN),
    ];
  }
  if (pose === "lift" || pose === "lying") {
    return [pose, pose, 0];
  }
  return ["surrender", "surrender", 0];
};

const weaponMesh = (kind: WeaponKind, shading: Shading): THREE.Group => {
  const held = new THREE.Group();
  held.visible = false;
  const shaft = (
    radiusTop: number,
    radiusBottom: number,
    length: number,
    color: number
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 6),
      shading.cel(color, { rim: 1 })
    );
    mesh.position.y = -length / 2;
    mesh.castShadow = true;
    held.add(mesh);
    return mesh;
  };
  const block = (
    size: readonly [number, number, number],
    at: readonly [number, number, number],
    color: number
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      shading.cel(color, { rim: 1 })
    );
    mesh.position.set(...at);
    mesh.castShadow = true;
    held.add(mesh);
    return mesh;
  };
  if (kind === "club") {
    shaft(0.06, 0.035, 0.62, 0x9b_6a_3b);
  } else if (kind === "crowbar") {
    shaft(0.02, 0.02, 0.6, 0xc8_2c_2c);
    block([0.04, 0.04, 0.14], [0, -0.6, 0.06], 0xc8_2c_2c);
  } else if (kind === "baton") {
    shaft(0.03, 0.03, 0.52, 0x25_26_30);
    block([0.03, 0.03, 0.12], [0, -0.12, 0.06], 0x25_26_30);
  } else if (kind === "cue") {
    shaft(0.012, 0.02, 1.3, 0xd9_b2_7b);
    block([0.045, 0.3, 0.045], [0, 0.05, 0], 0x4a_2e_20);
  } else if (kind === "sign") {
    shaft(0.02, 0.02, 0.9, 0x9a_a0_b6);
    const face = new THREE.CylinderGeometry(0.24, 0.24, 0.025, 8);
    face.rotateY(Math.PI / 8);
    face.rotateZ(Math.PI / 2);
    const plate = new THREE.Mesh(face, shading.cel(0xe7_26_3d, { rim: 1 }));
    plate.position.y = -1.08;
    plate.castShadow = true;
    held.add(plate);
    block([0.03, 0.07, 0.3], [0, -1.08, 0], 0xf2_ee_e6);
  } else if (kind === "chain") {
    for (let link = 0; link < 6; link += 1) {
      const mesh = block(
        [0.05, 0.1, 0.025],
        [0, -0.05 - link * 0.1, 0],
        0x9a_a0_b6
      );
      mesh.rotation.y = link % 2 === 0 ? 0 : Math.PI / 2;
    }
  }
  return held;
};

interface HeldWeapon {
  readonly kind: WeaponKind;
  readonly mesh: THREE.Group;
}

const weaponKinds: readonly WeaponKind[] = [
  "club",
  "chain",
  "crowbar",
  "baton",
  "cue",
  "sign",
];

const paletteOf = (index: number): Palette => {
  const colours = riderPalette[index];
  return new Map<string, THREE.ColorRepresentation>([
    ["suit", colours?.jacket ?? DEFAULT_JACKET],
    ["suit2", SUIT_PANEL],
    ["helmet", colours?.helmet ?? DEFAULT_HELMET],
    ["helmet2", colours?.trim ?? colours?.bike ?? DEFAULT_HELMET],
  ]);
};

const turnedFrom = (
  base: readonly number[],
  turns: readonly Turn[],
  root: THREE.Object3D,
  skeleton: THREE.Skeleton,
  names: readonly string[],
  bones: readonly (THREE.Bone | undefined)[]
): number[] => {
  for (const [index, bone] of bones.entries()) {
    bone?.quaternion.fromArray(base, index * 4);
  }
  root.updateMatrixWorld(true);
  const turned = [...base];
  const world = new THREE.Quaternion();
  const parent = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  for (const { axis, bone: name, degrees } of turns) {
    const bone = skeleton.getBoneByName(name);
    const index = names.indexOf(name);
    if (!bone || index === -1) {
      continue;
    }
    bone.getWorldQuaternion(world);
    bone.parent?.getWorldQuaternion(parent);
    turn.setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees));
    bone.quaternion.copy(parent.invert().multiply(turn.multiply(world)));
    bone.updateMatrixWorld(true);
    bone.quaternion.toArray(turned, index * 4);
  }
  return turned;
};

interface Sided<T> {
  readonly left: T;
  readonly right: T;
}

interface Riding {
  readonly seated: number[];
  readonly tucked: number[];
  readonly hang: Sided<number[]>;
  readonly tuckedHang: Sided<number[]>;
  readonly flinch: Sided<number[]>;
}

const sideOf = <T>(sided: Sided<T>, side: number): T =>
  side < 0 ? sided.left : sided.right;

const bodyFor = (assets: Assets, index: number): RiderAsset => {
  const asset = assets.riders[index % assets.riders.length];
  if (!asset) {
    throw new Error("No rider model is loaded.");
  }
  return asset;
};

export const createRiderFigure = (
  assets: Assets,
  shading: Shading,
  jacketIndex: number,
  build: number
): RiderFigure => {
  const asset = bodyFor(assets, build);
  const root = new THREE.Group();
  const model = cloneRig(asset.scene);
  model.rotation.y = Math.PI;
  root.add(model);

  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) {
      skinned.push(node);
    }
  });
  const [first] = skinned;
  const painted = paintPrimitives(asset.primitives, paletteOf(jacketIndex));
  if (!(first && painted.cel)) {
    throw new Error("The rider model has no skin.");
  }
  const { skeleton } = first;
  const body = new THREE.SkinnedMesh(painted.cel, shading.paint());
  body.castShadow = true;
  body.receiveShadow = true;
  body.frustumCulled = false;
  first.parent?.add(body);
  body.bind(skeleton, first.bindMatrix);
  for (const mesh of skinned) {
    mesh.removeFromParent();
  }

  const bones = asset.bones.map((name) => skeleton.getBoneByName(name));
  skeleton.getBoneByName("pelvis")?.position.set(0, 0, 0);
  const seated = asset.poses.get("seated");
  if (!seated) {
    throw new Error("The rider model has no seated pose.");
  }
  const bake = (base: readonly number[], turns: readonly Turn[]) =>
    turnedFrom(base, turns, root, skeleton, asset.bones, bones);
  const tucked = bake(seated, TUCK_TURNS);
  const riding: Riding = {
    flinch: {
      left: bake(seated, flinchTurns(-1)),
      right: bake(seated, flinchTurns(1)),
    },
    hang: {
      left: bake(seated, hangTurns(-1)),
      right: bake(seated, hangTurns(1)),
    },
    seated,
    tucked,
    tuckedHang: {
      left: bake(tucked, hangTurns(-1)),
      right: bake(tucked, hangTurns(1)),
    },
  };
  const current = [...seated];
  const wanted = [...current];
  const base = [...current];
  const upright = [...current];
  const bent = [...current];

  const hands = [
    skeleton.getBoneByName("hand_l"),
    skeleton.getBoneByName("hand_r"),
  ];
  const held: HeldWeapon[][] = hands.map((hand) =>
    weaponKinds.map((kind) => {
      const mesh = weaponMesh(kind, shading);
      mesh.position.set(0, 0.07, 0);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      hand?.add(mesh);
      return { kind, mesh };
    })
  );

  const showWeapon = (weapon: WeaponKind, pose: RiderPose, side: number) => {
    const swinging = pose === "windup" || pose === "swing" || pose === "swung";
    const weaponHand = swinging && side < 0 ? 0 : 1;
    for (const [hand, meshes] of held.entries()) {
      for (const each of meshes) {
        each.mesh.visible = each.kind === weapon && hand === weaponHand;
      }
    }
  };

  const apply = () => {
    for (const [index, bone] of bones.entries()) {
      bone?.quaternion.fromArray(current, index * 4);
    }
  };
  apply();

  const settleBase = ({ flinch, flinchSide, lean, tuck }: Stance) => {
    const hang = Math.min(1, Math.abs(lean));
    const hangSide = lean < 0 ? -1 : 1;
    const seatedHang = sideOf(riding.hang, hangSide);
    const tuckedHang = sideOf(riding.tuckedHang, hangSide);
    const flinched = sideOf(riding.flinch, flinchSide);
    for (let offset = 0; offset < base.length; offset += 4) {
      THREE.Quaternion.slerpFlat(
        upright,
        offset,
        riding.seated,
        offset,
        seatedHang,
        offset,
        hang
      );
      THREE.Quaternion.slerpFlat(
        bent,
        offset,
        riding.tucked,
        offset,
        tuckedHang,
        offset,
        hang
      );
      THREE.Quaternion.slerpFlat(
        base,
        offset,
        upright,
        offset,
        bent,
        offset,
        tuck
      );
      if (flinch > 0) {
        THREE.Quaternion.slerpFlat(
          base,
          offset,
          base,
          offset,
          flinched,
          offset,
          flinch
        );
      }
    }
  };

  const aim = (stance: Stance): boolean => {
    const { pose, reach, side, time } = stance;
    if (pose === "seated") {
      settleBase(stance);
      wanted.splice(0, wanted.length, ...base);
      return true;
    }
    if (striking(pose)) {
      settleBase(stance);
      const to = asset.poses.get(strikeName(pose, side));
      const from =
        pose === "swing" ? asset.poses.get(strikeName("windup", side)) : base;
      if (!(from && to)) {
        return false;
      }
      for (let offset = 0; offset < wanted.length; offset += 4) {
        THREE.Quaternion.slerpFlat(
          wanted,
          offset,
          from,
          offset,
          to,
          offset,
          reach
        );
      }
      return true;
    }
    const [fromName, toName, blend] = cycleFor(pose, time);
    const from = asset.poses.get(fromName);
    const to = asset.poses.get(toName);
    if (!(from && to)) {
      return false;
    }
    for (let offset = 0; offset < wanted.length; offset += 4) {
      THREE.Quaternion.slerpFlat(
        wanted,
        offset,
        from,
        offset,
        to,
        offset,
        blend
      );
    }
    return true;
  };

  return {
    animate(stance, seconds) {
      if (!aim(stance)) {
        return;
      }
      const blend = striking(stance.pose)
        ? 1
        : Math.min(1, BLEND_RATE * seconds);
      for (let offset = 0; offset < current.length; offset += 4) {
        THREE.Quaternion.slerpFlat(
          current,
          offset,
          current,
          offset,
          wanted,
          offset,
          blend
        );
      }
      apply();
      showWeapon(
        stance.pose === "surrender" ? "none" : stance.weapon,
        stance.pose,
        stance.side
      );
    },
    dispose() {
      disposeTree(root);
      skeleton.dispose();
    },
    root,
    seat: asset.seat,
    standHeight: asset.standHeight,
  };
};
