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
  | "surrender";

const DEFAULT_JACKET = 0x23_26_2c;
const DEFAULT_HELMET = 0xf2_c2_30;
const SUIT_PANEL = "#1c1826";
const BLEND_RATE = 16;
const SNAP_RATE = 24;
const RECOIL = 0.6;
const RUN_HZ = 2.6;
const TUMBLE_HZ = 1.75;
const FULL_TURN = Math.PI * 2;
const PITCH_FORWARD = new THREE.Vector3(-1, 0, 0);
const ROLL_INWARD = new THREE.Vector3(0, 0, 1);

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
  { axis: ROLL_INWARD, bone: "upperarm_l", degrees: 16 },
  { axis: ROLL_INWARD, bone: "upperarm_r", degrees: -16 },
  { axis: PITCH_FORWARD, bone: "lowerarm_l", degrees: 14 },
  { axis: PITCH_FORWARD, bone: "lowerarm_r", degrees: 14 },
];

export interface RiderFigure {
  readonly root: THREE.Group;
  readonly seat: THREE.Vector3;
  readonly standHeight: number;
  dispose: () => void;
  recoil: () => void;
  animate: (
    pose: RiderPose,
    time: number,
    seconds: number,
    side: number,
    weapon: WeaponKind,
    tuck: number
  ) => void;
}

const striking = (pose: RiderPose): boolean =>
  pose === "punch" || pose === "kick" || pose === "windup" || pose === "swing";

interface Target {
  from: PoseName;
  to: PoseName;
  blend: number;
}

const sided = (
  left: PoseName,
  right: PoseName,
  side: number
): readonly [PoseName, PoseName, number] => {
  const pose = side < 0 ? left : right;
  return [pose, pose, 0];
};

const aimFor = (
  pose: RiderPose,
  time: number,
  side: number
): readonly [PoseName, PoseName, number] => {
  if (pose === "punch") {
    return sided("punch_l", "punch_r", side);
  }
  if (pose === "kick") {
    return sided("kick_l", "kick_r", side);
  }
  if (pose === "windup") {
    return sided("windup_l", "windup_r", side);
  }
  if (pose === "swing") {
    return sided("swing_l", "swing_r", side);
  }
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
  if (pose === "seated" || pose === "lift" || pose === "lying") {
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

const tuckedFrom = (
  seated: readonly number[],
  root: THREE.Object3D,
  skeleton: THREE.Skeleton,
  names: readonly string[],
  bones: readonly (THREE.Bone | undefined)[]
): number[] => {
  for (const [index, bone] of bones.entries()) {
    bone?.quaternion.fromArray(seated, index * 4);
  }
  root.updateMatrixWorld(true);
  const tucked = [...seated];
  const world = new THREE.Quaternion();
  const parent = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  for (const { axis, bone: name, degrees } of TUCK_TURNS) {
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
    bone.quaternion.toArray(tucked, index * 4);
  }
  return tucked;
};

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
  const tucked = seated
    ? tuckedFrom(seated, root, skeleton, asset.bones, bones)
    : [];
  const current = [...(seated ?? [])];
  const wanted = [...current];
  const target: Target = { blend: 0, from: "seated", to: "seated" };

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
    const swinging = pose === "windup" || pose === "swing";
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

  return {
    animate(pose, time, seconds, side, weapon, tuck) {
      [target.from, target.to, target.blend] = aimFor(pose, time, side);
      const from = asset.poses.get(target.from);
      let to = asset.poses.get(target.to);
      if (pose === "seated" && tuck > 0 && tucked.length > 0) {
        to = tucked;
        target.blend = tuck;
      }
      if (!(from && to)) {
        return;
      }
      const rate = striking(pose) ? SNAP_RATE : BLEND_RATE;
      const blend = Math.min(1, rate * seconds);
      for (let offset = 0; offset < current.length; offset += 4) {
        THREE.Quaternion.slerpFlat(
          wanted,
          offset,
          from,
          offset,
          to,
          offset,
          target.blend
        );
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
      showWeapon(pose === "surrender" ? "none" : weapon, pose, side);
    },
    dispose() {
      disposeTree(root);
      skeleton.dispose();
    },
    recoil() {
      if (!seated) {
        return;
      }
      for (let offset = 0; offset < current.length; offset += 4) {
        THREE.Quaternion.slerpFlat(
          current,
          offset,
          current,
          offset,
          seated,
          offset,
          RECOIL
        );
      }
    },
    root,
    seat: asset.seat,
    standHeight: asset.standHeight,
  };
};
