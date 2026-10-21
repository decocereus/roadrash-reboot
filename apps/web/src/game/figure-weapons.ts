import type { WeaponKind } from "@racer/sim/state";
import * as THREE from "three";

import type { Shading } from "./cel.ts";

export const weaponMesh = (kind: WeaponKind, shading: Shading): THREE.Group => {
  const held = new THREE.Group();
  const shaft = (
    radiusTop: number,
    radiusBottom: number,
    length: number,
    color: number
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 6),
      shading.cel(color, { rim: 1 })
    );
    mesh.position.y = -length / 2;
    mesh.castShadow = true;
    held.add(mesh);
    return mesh;
  };
  const block = (
    size: readonly [number, number, number],
    at: readonly [number, number, number],
    color: number
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      shading.cel(color, { rim: 1 })
    );
    mesh.position.set(...at);
    mesh.castShadow = true;
    held.add(mesh);
    return mesh;
  };
  if (kind === "club") {
    shaft(0.06, 0.035, 0.62, 0x9b_6a_3b);
  } else if (kind === "crowbar") {
    shaft(0.02, 0.02, 0.6, 0xc8_2c_2c);
    block([0.04, 0.04, 0.14], [0, -0.6, 0.06], 0xc8_2c_2c);
  } else if (kind === "baton") {
    shaft(0.03, 0.03, 0.52, 0x25_26_30);
    block([0.03, 0.03, 0.12], [0, -0.12, 0.06], 0x25_26_30);
  } else if (kind === "cue") {
    shaft(0.012, 0.02, 1.3, 0xd9_b2_7b);
    block([0.045, 0.3, 0.045], [0, 0.05, 0], 0x4a_2e_20);
  } else if (kind === "sign") {
    shaft(0.02, 0.02, 0.9, 0x9a_a0_b6);
    const face = new THREE.CylinderGeometry(0.24, 0.24, 0.025, 8);
    face.rotateY(Math.PI / 8);
    face.rotateZ(Math.PI / 2);
    const plate = new THREE.Mesh(face, shading.cel(0xe7_26_3d, { rim: 1 }));
    plate.position.y = -1.08;
    plate.castShadow = true;
    held.add(plate);
    block([0.03, 0.07, 0.3], [0, -1.08, 0], 0xf2_ee_e6);
  } else if (kind === "chain") {
    for (let link = 0; link < 6; link += 1) {
      const mesh = block(
        [0.05, 0.1, 0.025],
        [0, -0.05 - link * 0.1, 0],
        0x9a_a0_b6
      );
      mesh.rotation.y = link % 2 === 0 ? 0 : Math.PI / 2;
    }
  }
  return held;
};

export const weaponKinds: readonly WeaponKind[] = [
  "club",
  "chain",
  "crowbar",
  "baton",
  "cue",
  "sign",
];
