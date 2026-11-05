import type { WeaponKind } from "@racer/sim/state";
import { MeshoptSimplifier } from "meshoptimizer/simplifier";
import * as THREE from "three";
import { clone as cloneRig } from "three/addons/utils/SkeletonUtils.js";

import { paintPrimitives } from "./assets.ts";
import type { Palette, PoseName, RiderAsset } from "./assets.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { reachOfPoses } from "./figure-bounds.ts";
import { cycleFor, strikeName, striking } from "./figure-cycle.ts";
import type { Cycle } from "./figure-cycle.ts";
import {
  flinchTurns,
  hangTurns,
  kickedFrom,
  HANG_SHIFT,
  kneeOut,
  planterOf,
  riseOffset,
  risenTurns,
  sideOf,
  TUCK_TURNS,
  turnedFrom,
} from "./figure-pose.ts";
import type { RiderPose, Riding, Sided, Turn } from "./figure-pose.ts";
import { posed, PosedSkeleton } from "./figure-rig.ts";
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
  speed: number;
  reach: number;
  rise: number;
  flinch: number;
  flinchSide: number;
}

const BLEND_RATE = 16;
const HOLD_RATE = 9;

export interface RiderFigure {
  readonly root: THREE.Group;
  readonly seat: THREE.Vector3;
  readonly standHeight: number;
  dispose: () => void;
  animate: (stance: Stance, seconds: number) => void;
  rest: () => void;
  readonly judgeFar: (pixelsTall: number) => void;
  holdEveryWeapon: () => () => void;
  bakePose: (base: PoseName, turns: readonly Turn[]) => number[];
  holdPose: (
    from: number[],
    to: number[],
    blend: number,
    seconds: number
  ) => void;
}

await MeshoptSimplifier.ready;

const FAR_TRIANGLES = 4000;
const FAR_ERROR = 0.4;
const FAR_BELOW_PIXELS = 80;
const NEAR_ABOVE_PIXELS = 92;

const staysFar = (wasFar: boolean, pixelsTall: number): boolean =>
  pixelsTall < (wasFar ? NEAR_ABOVE_PIXELS : FAR_BELOW_PIXELS);

const farIndexes = new WeakMap<RiderAsset, THREE.BufferAttribute>();

const farIndexOf = (
  asset: RiderAsset,
  near: THREE.BufferGeometry
): THREE.BufferAttribute => {
  const known = farIndexes.get(asset);
  if (known) {
    return known;
  }
  const { index } = near;
  if (!index) {
    throw new Error("The rider body has no index.");
  }
  const position = near.getAttribute("position");
  const positions = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    positions[vertex * 3] = position.getX(vertex);
    positions[vertex * 3 + 1] = position.getY(vertex);
    positions[vertex * 3 + 2] = position.getZ(vertex);
  }
  const [simplified] = MeshoptSimplifier.simplify(
    new Uint32Array(index.array),
    positions,
    3,
    FAR_TRIANGLES * 3,
    FAR_ERROR
  );
  const attribute = new THREE.BufferAttribute(simplified, 1);
  farIndexes.set(asset, attribute);
  return attribute;
};

const farBodyOf = (
  asset: RiderAsset,
  near: THREE.BufferGeometry
): THREE.BufferGeometry => {
  const far = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(near.attributes)) {
    far.setAttribute(name, attribute);
  }
  far.setIndex(farIndexOf(asset, near));
  return far;
};

const reachByAsset = new WeakMap<RiderAsset, THREE.Sphere>();

export const createRiderFigure = (
  asset: RiderAsset,
  shading: Shading,
  palette: Palette
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
  const painted = paintPrimitives(asset.primitives, palette);
  if (!(first && painted.cel)) {
    throw new Error("The rider model has no skin.");
  }
  const skeleton = new PosedSkeleton(
    first.skeleton.bones,
    first.skeleton.boneInverses
  );
  const near = painted.cel;
  const farBody = farBodyOf(asset, near);
  let far = false;
  const body = new THREE.SkinnedMesh(near, shading.figure(asset.atlas));
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
    left: bake(seated, risenTurns(-1)),
    right: bake(seated, risenTurns(1)),
  };
  const lifts = { left: riseOffset(-1), right: riseOffset(1) };
  const lift = new THREE.Vector3();
  const planter = planterOf(rig, seated);
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

  const composeBones = (automatic: boolean) => {
    for (const bone of bones) {
      if (bone) {
        bone.matrixAutoUpdate = automatic;
      }
    }
  };
  composeBones(false);

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
      planter.plant(base, lift, "seated", side, 0, 0);
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
      lift.copy(sideOf(lifts, stance.side)).multiplyScalar(stance.rise);
      lift.x +=
        Math.sign(stance.lean) *
        HANG_SHIFT *
        kneeOut(stance.lean, stance.speed);
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
      planter.plant(
        current,
        lift,
        stance.pose,
        stance.side,
        stance.lean,
        stance.speed
      );
      apply();
      model.position.copy(lift);
      showWeapon(
        stance.pose === "surrender" ? "none" : stance.weapon,
        stance.pose,
        stance.side
      );
    },
    bakePose(from, turns) {
      const pose = asset.poses.get(from);
      if (!pose) {
        throw new Error(`The rider model has no ${from} pose.`);
      }
      composeBones(true);
      const baked = bake(pose, turns);
      posed(rig, written);
      composeBones(false);
      return baked;
    },
    dispose() {
      holding?.removeFromParent();
      holding = null;
      for (const meshes of held) {
        for (const mesh of meshes) {
          disposeTree(mesh);
        }
      }
      body.geometry = near;
      farBody.dispose();
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
    holdPose(from, to, blend, seconds) {
      skeleton.stale = true;
      const follow = Math.min(1, HOLD_RATE * seconds);
      for (let offset = 0; offset < current.length; offset += 4) {
        THREE.Quaternion.slerpFlat(
          wanted,
          offset,
          from,
          offset,
          to,
          offset,
          blend
        );
        THREE.Quaternion.slerpFlat(
          current,
          offset,
          current,
          offset,
          wanted,
          offset,
          follow
        );
      }
      apply();
      model.position.set(0, 0, 0);
    },
    judgeFar(pixelsTall) {
      far = staysFar(far, pixelsTall);
      body.geometry = far ? farBody : near;
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
