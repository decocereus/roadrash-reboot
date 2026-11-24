import * as THREE from "three";

import type { Rig } from "./figure-rig.ts";

const SPACING = 0.03;
const INFLUENCES = 4;
export const BARE_FRONT = 0.3146;

export const forearmBones = ["lowerarm_l", "lowerarm_r"] as const;

export const chestBones = [
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
  "head",
  "clavicle_l",
  "clavicle_r",
  "upperarm_l",
  "upperarm_r",
] as const;

const spineBones = [
  "pelvis",
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
] as const;

interface ChestPull {
  readonly bone: number;
  readonly at: THREE.Vector3;
  readonly weight: number;
}

export interface ChestPoint {
  readonly pulls: readonly ChestPull[];
  readonly give: number;
}

const ownerOf = (
  weightOf: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertex: number
): number => {
  let owner = 0;
  for (let slot = 1; slot < INFLUENCES; slot += 1) {
    if (
      weightOf.getComponent(vertex, slot) > weightOf.getComponent(vertex, owner)
    ) {
      owner = slot;
    }
  }
  return owner;
};

export interface Cloth {
  readonly frontRatio: number;
  readonly giveAt: (vertex: number) => number;
}

export const clothOf = (body: THREE.SkinnedMesh): Cloth => {
  const { bindMatrix, geometry, skeleton } = body;
  const bindAt = (name: string) => {
    const bone = skeleton.getBoneByName(name);
    const inverse = bone && skeleton.boneInverses[skeleton.bones.indexOf(bone)];
    if (!inverse) {
      throw new Error(`The rider model has no ${name} bone.`);
    }
    return new THREE.Vector3().setFromMatrixPosition(inverse.clone().invert());
  };
  const line = spineBones.map(bindAt);
  const [pelvis] = line;
  const neck = line.at(-1);
  if (!(pelvis && neck)) {
    throw new Error("The rider model has no spine.");
  }
  const forward = bindAt("ball_l").sub(bindAt("foot_l")).setY(0).normalize();
  const onLine = new THREE.Vector3();
  const lineAt = (height: number) => {
    for (let index = 1; index < line.length; index += 1) {
      const from = line[index - 1];
      const to = line[index];
      if (from && to && (height <= to.y || index === line.length - 1)) {
        const share = THREE.MathUtils.clamp(
          (height - from.y) / (to.y - from.y),
          0,
          1
        );
        return onLine.copy(from).lerp(to, share);
      }
    }
    return onLine.copy(pelvis);
  };
  const torso = new Set(
    spineBones
      .slice(0, -1)
      .map((name) => skeleton.bones.findIndex((bone) => bone.name === name))
  );
  const position = geometry.getAttribute("position");
  const boneOf = geometry.getAttribute("skinIndex");
  const weightOf = geometry.getAttribute("skinWeight");
  const standoffs = new Float32Array(position.count).fill(-Infinity);
  const bound = new THREE.Vector3();
  let deepest = 0;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    if (torso.has(boneOf.getComponent(vertex, ownerOf(weightOf, vertex)))) {
      bound.fromBufferAttribute(position, vertex).applyMatrix4(bindMatrix);
      const standoff = bound.sub(lineAt(bound.y)).dot(forward);
      standoffs[vertex] = standoff;
      deepest = Math.max(deepest, standoff);
    }
  }
  const spine = pelvis.distanceTo(neck);
  const bare = BARE_FRONT * spine;
  return {
    frontRatio: deepest / spine,
    giveAt: (vertex) => Math.max(0, (standoffs[vertex] ?? -Infinity) - bare),
  };
};

export const chestOf = (
  rig: Rig,
  body: THREE.SkinnedMesh,
  bones: readonly string[],
  giveAt: (vertex: number) => number
): ChestPoint[] => {
  const { bindMatrix, geometry, skeleton } = body;
  const position = geometry.getAttribute("position");
  const boneOf = geometry.getAttribute("skinIndex");
  const weightOf = geometry.getAttribute("skinWeight");
  const chest = new Set<number>();
  for (const name of bones) {
    const bone = skeleton.getBoneByName(name);
    if (!bone) {
      throw new Error(`The rider model has no ${name} bone.`);
    }
    chest.add(skeleton.bones.indexOf(bone));
  }
  const rigIndex = skeleton.bones.map((bone) => rig.bones.indexOf(bone));
  const toBone = skeleton.boneInverses.map((inverse) =>
    inverse.clone().multiply(bindMatrix)
  );
  const kept = new Map<string, ChestPoint>();
  const bound = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const owner = boneOf.getComponent(vertex, ownerOf(weightOf, vertex));
    if (!chest.has(owner)) {
      continue;
    }
    bound.fromBufferAttribute(position, vertex).applyMatrix4(bindMatrix);
    const cell = `${Math.floor(bound.x / SPACING)}:${Math.floor(
      bound.y / SPACING
    )}:${Math.floor(bound.z / SPACING)}`;
    if (kept.has(cell)) {
      continue;
    }
    const pulls: ChestPull[] = [];
    for (let slot = 0; slot < INFLUENCES; slot += 1) {
      const index = boneOf.getComponent(vertex, slot);
      const weight = weightOf.getComponent(vertex, slot);
      const matrix = toBone[index];
      const bone = rigIndex[index] ?? -1;
      if (weight > 0 && matrix && bone >= 0) {
        pulls.push({
          at: new THREE.Vector3()
            .fromBufferAttribute(position, vertex)
            .applyMatrix4(matrix),
          bone,
          weight,
        });
      }
    }
    kept.set(cell, { give: giveAt(vertex), pulls });
  }
  return [...kept.values()];
};
