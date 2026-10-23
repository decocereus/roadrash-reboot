import type * as THREE from "three";

import { isInstancedMesh, isMesh, isPoints } from "./meshes.ts";

export const disposeTree = (root: THREE.Object3D): void => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    if (isInstancedMesh(node)) {
      node.dispose();
    }
    if (isMesh(node) || isPoints(node)) {
      geometries.add(node.geometry);
      for (const material of [node.material].flat()) {
        materials.add(material);
      }
    }
  });
  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
};
