import * as THREE from "three";

export const isMesh = (node: THREE.Object3D): node is THREE.Mesh =>
  node instanceof THREE.Mesh;

export const isInstancedMesh = (
  node: THREE.Object3D
): node is THREE.InstancedMesh => node instanceof THREE.InstancedMesh;

export const isPoints = (node: THREE.Object3D): node is THREE.Points =>
  node instanceof THREE.Points;

export const isSkinnedMesh = (
  node: THREE.Object3D
): node is THREE.SkinnedMesh => node instanceof THREE.SkinnedMesh;
