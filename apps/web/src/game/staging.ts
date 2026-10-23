import type * as THREE from "three";

import { isMesh } from "./meshes.ts";

export interface Staged {
  readonly world: {
    readonly scene: THREE.Scene;
    readonly follow: (camera: THREE.Camera, s: number) => void;
    readonly samples: () => THREE.Group;
  };
  readonly camera: THREE.Camera;
  readonly at: number;
  readonly figures: readonly { readonly holdEveryWeapon: () => () => void }[];
  readonly puffs: { readonly prime: () => () => void } | null;
  readonly prepare: (scene: THREE.Scene) => void;
}

const revealAll = (root: THREE.Object3D): (() => void) => {
  const hidden: THREE.Object3D[] = [];
  const culled: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (!node.visible) {
      hidden.push(node);
      node.visible = true;
    }
    if (node.frustumCulled) {
      culled.push(node);
      node.frustumCulled = false;
    }
  });
  return () => {
    for (const node of hidden) {
      node.visible = false;
    }
    for (const node of culled) {
      node.frustumCulled = true;
    }
  };
};

const dropGeometry = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    if (isMesh(node)) {
      node.geometry.dispose();
    }
  });
};

export const stageEverything = ({
  at,
  camera,
  figures,
  prepare,
  puffs,
  world,
}: Staged): (() => void) => {
  const undo: (() => void)[] = [];
  const unstage = () => {
    for (const step of undo.splice(0).toReversed()) {
      step();
    }
  };
  try {
    world.follow(camera, at);
    const samples = world.samples();
    world.scene.add(samples);
    undo.push(() => {
      world.scene.remove(samples);
      dropGeometry(samples);
    });
    for (const figure of figures) {
      undo.push(figure.holdEveryWeapon());
    }
    if (puffs) {
      undo.push(puffs.prime());
    }
    prepare(world.scene);
    undo.push(revealAll(world.scene));
  } catch (error) {
    unstage();
    throw error;
  }
  return unstage;
};

export const warmStaged = (staged: Staged, render: () => void): void => {
  const unstage = stageEverything(staged);
  try {
    render();
  } finally {
    unstage();
  }
};
