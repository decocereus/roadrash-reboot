import * as THREE from "three";

import type { Rig } from "./figure-rig.ts";

const SPACING = 0.03;
const INFLUENCES = 4;

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

interface ChestPull {
  readonly bone: number;
  readonly at: THREE.Vector3;
  readonly weight: number;
}

export type ChestPoint = readonly ChestPull[];

export const chestOf = (
  rig: Rig,
  body: THREE.SkinnedMesh,
  bones: readonly string[]
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
    let owner = 0;
    for (let slot = 1; slot < INFLUENCES; slot += 1) {
      if (
        weightOf.getComponent(vertex, slot) >
        weightOf.getComponent(vertex, owner)
      ) {
        owner = slot;
      }
    }
    if (!chest.has(boneOf.getComponent(vertex, owner))) {
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
    kept.set(cell, pulls);
  }
  return [...kept.values()];
};
