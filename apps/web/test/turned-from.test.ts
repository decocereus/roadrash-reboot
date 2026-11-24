import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { turnedFrom } from "../src/game/figure-pose.ts";
import type { Turn } from "../src/game/figure-pose.ts";
import { read } from "../src/game/figure-rig.ts";
import type { Rig } from "../src/game/figure-rig.ts";

const NAMES = ["spine_01", "spine_02", "neck_01"] as const;

const chainRig = (): Rig => {
  const root = new THREE.Group();
  root.rotation.y = Math.PI;
  const bones = NAMES.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(0, 0.2, 0);
    return bone;
  });
  let parent: THREE.Object3D = root;
  for (const bone of bones) {
    parent.add(bone);
    parent = bone;
  }
  root.updateMatrixWorld(true);
  return {
    bones,
    names: NAMES,
    root,
    skeleton: new THREE.Skeleton(bones),
  };
};

const poseOf = (...eulers: readonly THREE.Euler[]) =>
  eulers.flatMap((euler) =>
    new THREE.Quaternion().setFromEuler(euler).toArray()
  );

const base = poseOf(
  new THREE.Euler(0.6, 0, 0.1),
  new THREE.Euler(-0.2, 0.3, 0),
  new THREE.Euler(0.1, 0, -0.4)
);
const shown = poseOf(
  new THREE.Euler(-0.9, 0.4, 0),
  new THREE.Euler(0.5, -0.6, 0.2),
  new THREE.Euler(0, 0.7, 0.3)
);
const turns: readonly Turn[] = [
  { axis: new THREE.Vector3(0, 0, 1), bone: "spine_02", degrees: 18 },
  { axis: new THREE.Vector3(-1, 0, 0), bone: "neck_01", degrees: -9 },
];

describe("a pose baked with turns in world space", () => {
  it("reads the base pose, not the last pose the bones were composed in", () => {
    const fresh = turnedFrom(chainRig(), base, turns);

    const held = chainRig();
    for (const [index, bone] of held.bones.entries()) {
      bone?.quaternion.fromArray(shown, index * 4);
      bone?.updateMatrix();
      if (bone) {
        bone.matrixAutoUpdate = false;
      }
    }
    held.root.updateMatrixWorld(true);
    expect(read(held, [...shown])).toStrictEqual(shown);

    const baked = turnedFrom(held, base, turns);
    for (const [index, value] of fresh.entries()) {
      expect(baked[index]).toBeCloseTo(value, 9);
    }
  });
});
