import * as THREE from "three";

export const counted = (target: THREE.EventDispatcher<{ dispose: object }>) => {
  const seen = { count: 0 };
  target.addEventListener("dispose", () => {
    seen.count += 1;
  });
  return seen;
};

export const rampOf = (material: THREE.Material): THREE.Texture => {
  if (!(material instanceof THREE.MeshToonMaterial && material.gradientMap)) {
    throw new Error("The material has no ramp.");
  }
  return material.gradientMap;
};
