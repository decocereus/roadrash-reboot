import * as THREE from "three";

export const isMesh = (node: THREE.Object3D): node is THREE.Mesh =>
  node instanceof THREE.Mesh;

export const isSkinnedMesh = (
  node: THREE.Object3D
): node is THREE.SkinnedMesh => node instanceof THREE.SkinnedMesh;
