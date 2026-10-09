import * as THREE from "three";

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node instanceof THREE.InstancedMesh) {
      node.dispose();
    }
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      for (const material of materials) {
        disposeMaterial(material);
      }
    }
  });
}
