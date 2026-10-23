import * as THREE from "three";

import { posed } from "./figure-rig.ts";
import type { Rig } from "./figure-rig.ts";

const WEAPON_REACH = 1.45;
const BLEND_SLACK = 0.25;

const boneRadii = (body: THREE.SkinnedMesh): Float64Array => {
  const { bindMatrix, geometry, skeleton } = body;
  const toBone = skeleton.boneInverses.map((inverse) =>
    inverse.clone().multiply(bindMatrix)
  );
  const radii = new Float64Array(skeleton.bones.length);
  const position = geometry.getAttribute("position");
  const boneOf = geometry.getAttribute("skinIndex");
  const weightOf = geometry.getAttribute("skinWeight");
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    for (let influence = 0; influence < 4; influence += 1) {
      const bone = boneOf.getComponent(vertex, influence);
      const matrix = toBone[bone];
      if (weightOf.getComponent(vertex, influence) > 0 && matrix) {
        point.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
        radii[bone] = Math.max(radii[bone] ?? 0, point.length());
      }
    }
  }
  return radii;
};

export const reachOfPoses = (
  rig: Rig,
  body: THREE.SkinnedMesh,
  hands: readonly (THREE.Bone | undefined)[],
  poses: readonly (readonly number[])[]
): THREE.Sphere => {
  const radii = boneRadii(body);
  const bounds = new THREE.Sphere().makeEmpty();
  const part = new THREE.Sphere();
  const enclose = (bone: THREE.Object3D, radius: number) => {
    part.center.setFromMatrixPosition(bone.matrixWorld);
    part.radius = radius * bone.matrixWorld.getMaxScaleOnAxis();
    bounds.union(part);
  };
  for (const pose of poses) {
    posed(rig, pose);
    const { bones } = body.skeleton;
    for (let index = 0; index < bones.length; index += 1) {
      const bone = bones[index];
      if (bone) {
        enclose(bone, radii[index] ?? 0);
      }
    }
    for (const hand of hands) {
      if (hand) {
        enclose(hand, WEAPON_REACH);
      }
    }
  }
  bounds.applyMatrix4(body.matrixWorld.clone().invert());
  bounds.radius += BLEND_SLACK;
  return bounds;
};
