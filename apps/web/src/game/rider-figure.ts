import type { WeaponKind } from "@racer/sim/state";
import * as THREE from "three";
import { clone as cloneRig } from "three/addons/utils/SkeletonUtils.js";

import { paintPrimitives } from "./assets.ts";
import type { RiderAsset } from "./assets.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { reachOfPoses } from "./figure-bounds.ts";
import { cycleFor, strikeName, striking } from "./figure-cycle.ts";
import type { Cycle } from "./figure-cycle.ts";
import {
  flinchTurns,
  hangTurns,
  kickedFrom,
  riseOffset,
  risenFrom,
  sideOf,
  TUCK_TURNS,
  turnedFrom,
} from "./figure-pose.ts";
import type { RiderPose, Riding, Sided, Turn } from "./figure-pose.ts";
import { paletteOf, PosedSkeleton } from "./figure-rig.ts";
import type { Rig } from "./figure-rig.ts";
import { weaponKinds, weaponMesh } from "./figure-weapons.ts";
import { isSkinnedMesh } from "./meshes.ts";

export interface Stance {
  pose: RiderPose;
  time: number;
  side: number;
  weapon: WeaponKind;
  tuck: number;
  lean: number;
  reach: number;
  rise: number;
  flinch: number;
  flinchSide: number;
}

const BLEND_RATE = 16;

export interface RiderFigure {
  readonly root: THREE.Group;
  readonly seat: THREE.Vector3;
  readonly standHeight: number;
  dispose: () => void;
  animate: (stance: Stance, seconds: number) => void;
  rest: () => void;
  holdEveryWeapon: () => () => void;
}

const reachByAsset = new WeakMap<RiderAsset, THREE.Sphere>();

export const createRiderFigure = (
  asset: RiderAsset,
  shading: Shading,
  jacketIndex: number
): RiderFigure => {
  const root = new THREE.Group();
  const model = cloneRig(asset.scene);
  model.rotation.y = Math.PI;
  root.add(model);

  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse((node) => {
    if (isSkinnedMesh(node)) {
      skinned.push(node);
    }
  });
  const [first] = skinned;
  const painted = paintPrimitives(asset.primitives, paletteOf(jacketIndex));
  if (!(first && painted.cel)) {
    throw new Error("The rider model has no skin.");
  }
  const skeleton = new PosedSkeleton(
    first.skeleton.bones,
    first.skeleton.boneInverses
  );
  const body = new THREE.SkinnedMesh(painted.cel, shading.paint(asset.atlas));
  body.castShadow = true;
  body.receiveShadow = true;
  first.parent?.add(body);
  body.bind(skeleton, first.bindMatrix);
  for (const mesh of skinned) {
    mesh.removeFromParent();
    mesh.skeleton.dispose();
  }

  const bones = asset.bones.map((name) => skeleton.getBoneByName(name));
  skeleton.getBoneByName("pelvis")?.position.set(0, 0, 0);
  const seated = asset.poses.get("seated");
  const kickLeft = asset.poses.get("kick_l");
  const kickRight = asset.poses.get("kick_r");
  if (!(seated && kickLeft && kickRight)) {
    throw new Error("The rider model has no seated or kick pose.");
  }
  const rig: Rig = { bones, names: asset.bones, root, skeleton };
  const bake = (base: readonly number[], turns: readonly Turn[]) =>
    turnedFrom(rig, base, turns);
  const tucked = bake(seated, TUCK_TURNS);
  const risen = {
    left: risenFrom(rig, seated, -1),
    right: risenFrom(rig, seated, 1),
  };
  const lifts = { left: riseOffset(-1), right: riseOffset(1) };
  const riding: Riding = {
    flinch: {
      left: bake(seated, flinchTurns(-1)),
      right: bake(seated, flinchTurns(1)),
    },
    hang: {
      left: bake(seated, hangTurns(-1)),
      right: bake(seated, hangTurns(1)),
    },
    kicked: {
      left: kickedFrom(rig, risen.left, kickLeft, -1),
      right: kickedFrom(rig, risen.right, kickRight, 1),
    },
    risen,
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
  const written = current.map(() => Number.NaN);
  const turn = new THREE.Quaternion();
  const cycle: Cycle = { blend: 0, from: "seated", to: "seated" };
  let resting = false;

  const hands = [
    skeleton.getBoneByName("hand_l"),
    skeleton.getBoneByName("hand_r"),
  ];
  const reach =
    reachByAsset.get(asset) ??
    reachOfPoses(rig, body, hands, [
      ...asset.poses.values(),
      ...Object.values(riding).flatMap((pose: number[] | Sided<number[]>) =>
        Array.isArray(pose) ? [pose] : [pose.left, pose.right]
      ),
    ]);
  reachByAsset.set(asset, reach);
  body.boundingSphere = reach;
  const held: THREE.Group[][] = hands.map(() =>
    weaponKinds.map((kind) => {
      const mesh = weaponMesh(kind, shading);
      mesh.position.set(0, 0.07, 0);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      return mesh;
    })
  );
  let holding: THREE.Group | null = null;

  const showWeapon = (weapon: WeaponKind, pose: RiderPose, side: number) => {
    const swinging = pose === "windup" || pose === "swing" || pose === "swung";
    const weaponHand = swinging && side < 0 ? 0 : 1;
    const kind = weaponKinds.indexOf(weapon);
    const next = kind === -1 ? null : (held[weaponHand]?.[kind] ?? null);
    if (next === holding) {
      return;
    }
    holding?.removeFromParent();
    if (next) {
      hands[weaponHand]?.add(next);
    }
    holding = next;
  };

  for (const bone of bones) {
    if (bone) {
      bone.matrixAutoUpdate = false;
    }
  }

  const apply = () => {
    let offset = -4;
    for (const bone of bones) {
      offset += 4;
      if (
        !bone ||
        (current[offset] === written[offset] &&
          current[offset + 1] === written[offset + 1] &&
          current[offset + 2] === written[offset + 2] &&
          current[offset + 3] === written[offset + 3])
      ) {
        continue;
      }
      turn.fromArray(current, offset);
      turn.toArray(written, offset);
      bone.matrix.compose(bone.position, turn, bone.scale);
      bone.matrixWorldNeedsUpdate = true;
    }
  };
  apply();

  const settleBase = ({
    flinch,
    flinchSide,
    lean,
    rise,
    side,
    tuck,
  }: Stance) => {
    const hang = Math.min(1, Math.abs(lean));
    const hangSide = lean < 0 ? -1 : 1;
    const seatedHang = sideOf(riding.hang, hangSide);
    const tuckedHang = sideOf(riding.tuckedHang, hangSide);
    const flinched = sideOf(riding.flinch, flinchSide);
    const risenPose = sideOf(riding.risen, side);
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
      if (rise > 0) {
        THREE.Quaternion.slerpFlat(
          base,
          offset,
          base,
          offset,
          risenPose,
          offset,
          rise
        );
      }
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

  const between = (from: number[], to: number[], blend: number): number[] => {
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
    return wanted;
  };

  const aim = (stance: Stance): number[] | null => {
    const { pose, reach: swing, side, time } = stance;
    if (pose === "seated") {
      settleBase(stance);
      return base;
    }
    if (striking(pose)) {
      settleBase(stance);
      const to =
        pose === "kick"
          ? sideOf(riding.kicked, side)
          : asset.poses.get(strikeName(pose, side));
      const from =
        pose === "swing" ? asset.poses.get(strikeName("windup", side)) : base;
      return from && to ? between(from, to, swing) : null;
    }
    cycleFor(pose, time, cycle);
    const from = asset.poses.get(cycle.from);
    const to = asset.poses.get(cycle.to);
    return from && to ? between(from, to, cycle.blend) : null;
  };

  return {
    animate(stance, seconds) {
      skeleton.stale = true;
      const target = aim(stance);
      if (!target) {
        return;
      }
      if (resting) {
        root.add(model);
      }
      const blend =
        resting || striking(stance.pose)
          ? 1
          : Math.min(1, BLEND_RATE * seconds);
      resting = false;
      for (let offset = 0; offset < current.length; offset += 4) {
        THREE.Quaternion.slerpFlat(
          current,
          offset,
          current,
          offset,
          target,
          offset,
          blend
        );
      }
      apply();
      model.position
        .copy(sideOf(lifts, stance.side))
        .multiplyScalar(stance.rise);
      showWeapon(
        stance.pose === "surrender" ? "none" : stance.weapon,
        stance.pose,
        stance.side
      );
    },
    dispose() {
      holding?.removeFromParent();
      holding = null;
      for (const meshes of held) {
        for (const mesh of meshes) {
          disposeTree(mesh);
        }
      }
      disposeTree(model);
      skeleton.dispose();
    },
    holdEveryWeapon() {
      for (let hand = 0; hand < held.length; hand += 1) {
        const meshes = held[hand];
        if (!meshes) {
          continue;
        }
        for (const mesh of meshes) {
          hands[hand]?.add(mesh);
        }
      }
      return () => {
        for (const meshes of held) {
          for (const mesh of meshes) {
            if (mesh !== holding) {
              mesh.removeFromParent();
            }
          }
        }
      };
    },
    rest() {
      if (!resting) {
        model.removeFromParent();
        resting = true;
      }
    },
    root,
    seat: asset.seat,
    standHeight: asset.standHeight,
  };
};
