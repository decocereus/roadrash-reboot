import * as THREE from "three";

export interface ShadowReach {
  reaches: (at: THREE.Vector3, radius: number) => boolean;
}

export interface CasterCounts {
  casting: number;
  drawn: number;
}

const local = new THREE.Vector3();

export const shadowReachOf = (light: THREE.DirectionalLight): ShadowReach => ({
  reaches(at, radius) {
    const { camera } = light.shadow;
    local.copy(at).applyMatrix4(camera.matrixWorldInverse);
    return (
      local.x + radius >= camera.left &&
      local.x - radius <= camera.right &&
      local.y + radius >= camera.bottom &&
      local.y - radius <= camera.top &&
      radius - local.z >= camera.near &&
      -radius - local.z <= camera.far
    );
  },
});

export const castersFirst = (mesh: THREE.InstancedMesh): CasterCounts => {
  const counts: CasterCounts = { casting: mesh.count, drawn: mesh.count };
  mesh.onBeforeShadow = () => {
    mesh.count = counts.casting;
  };
  mesh.onAfterShadow = () => {
    mesh.count = counts.drawn;
  };
  return counts;
};
