import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import { trackFor } from "@racer/track/roads";
import * as THREE from "three";

import { createChaseCamera } from "../src/game/chase-camera.ts";
import { createFleet } from "../src/game/fleet.ts";
import { isInstancedMesh } from "../src/game/meshes.ts";
import type { ShadowReach } from "../src/game/shadow-reach.ts";
import { createWorld } from "../src/game/world.ts";
import { acquire } from "./bike-contact.ts";

const WIDTH = 960;
const HEIGHT = 540;
const SETTLE_FRAMES = 120;
const LOOSE_MARGIN = 25;
const track = trackFor("breakwater-run");
const places = [560, 1850, 3500] as const;

interface Place {
  readonly s: number;
  readonly drawn: number;
  readonly reaching: number;
  readonly loose: number;
  readonly submitted: number;
  readonly sameShadowCamera: boolean;
  readonly changedFromMain: number;
  readonly actorShadowPixels: number;
}

const trianglesOf = (mesh: THREE.InstancedMesh): number =>
  (mesh.geometry.getIndex()?.count ??
    mesh.geometry.getAttribute("position").count) / 3;

const actorsIn = (
  scene: THREE.Object3D,
  fleet: THREE.Object3D
): THREE.InstancedMesh[] => {
  const meshes: THREE.InstancedMesh[] = [];
  scene.traverse((node) => {
    if (
      isInstancedMesh(node) &&
      node.castShadow &&
      (node.parent === fleet || node.geometry.hasAttribute("walkerFrame"))
    ) {
      meshes.push(node);
    }
  });
  return meshes;
};

const sunOf = (scene: THREE.Scene): THREE.DirectionalLight => {
  const suns: THREE.DirectionalLight[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.DirectionalLight && node.castShadow) {
      suns.push(node);
    }
  });
  const [sun] = suns;
  if (!sun) {
    throw new Error("The world has no shadow-casting sun.");
  }
  return sun;
};

const viewOf = ({
  shadow: { camera },
}: THREE.DirectionalLight): THREE.Matrix4 =>
  new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );

const pixelsApart = (a: Uint8Array, b: Uint8Array): number => {
  let apart = 0;
  for (let index = 0; index < a.length; index += 4) {
    if (
      a[index] !== b[index] ||
      a[index + 1] !== b[index + 1] ||
      a[index + 2] !== b[index + 2]
    ) {
      apart += 1;
    }
  }
  return apart;
};

const instancesWhere = (
  meshes: readonly THREE.InstancedMesh[],
  test: (sphere: THREE.Sphere) => boolean
): number => {
  const matrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  let triangles = 0;
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingSphere();
    const bounds = mesh.geometry.boundingSphere ?? new THREE.Sphere();
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      if (test(sphere.copy(bounds).applyMatrix4(matrix))) {
        triangles += trianglesOf(mesh);
      }
    }
  }
  return triangles;
};

export const run = async (): Promise<Place[]> => {
  const notes: string[] = [];
  const { assets, release } = await acquire(notes);
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.shadowMap.enabled = true;
  const world = createWorld(track, assets);
  const race = createRaceRun(defaultSetup(track, 3));
  const fleet = createFleet(
    assets,
    world.shading,
    race.view.cars,
    race.view.crossCars
  );
  world.scene.add(fleet.group);
  const chase = createChaseCamera();
  chase.resize(WIDTH, HEIGHT);
  const sun = sunOf(world.scene);
  const drawnWith = new THREE.Matrix4();
  let submitted = 0;
  const renderShadows = renderer.shadowMap.render.bind(renderer.shadowMap);
  renderer.shadowMap.render = (lights, scene, camera) => {
    const before = renderer.info.render.triangles;
    renderShadows(lights, scene, camera);
    submitted = renderer.info.render.triangles - before;
    drawnWith.copy(viewOf(sun));
  };
  const shadowTriangles = (actors: readonly THREE.InstancedMesh[]): number => {
    const shown = actors.map((mesh) => mesh.visible);
    for (const mesh of actors) {
      mesh.visible = false;
    }
    renderer.render(world.scene, chase.camera);
    const without = submitted;
    for (const [index, mesh] of actors.entries()) {
      mesh.visible = shown[index] ?? false;
    }
    renderer.render(world.scene, chase.camera);
    return submitted - without;
  };
  const frame = (): Uint8Array => {
    renderer.render(world.scene, chase.camera);
    const gl = renderer.getContext();
    const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
    gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const inBox = world.shadows.reaches;
  const showAt = (s: number, reaches: ShadowReach["reaches"]): void => {
    world.shadows.reaches = reaches;
    world.showRoadLife(race.view, s);
    fleet.commit(s, world.shadows);
  };
  const results = places.map((s): Place => {
    for (let step = 0; step < SETTLE_FRAMES; step += 1) {
      chase.update(track, { air: 0, s, speed: 20, tuck: 0, x: 0 }, 1 / 60);
    }
    world.follow(chase.camera, s);
    for (const [index, car] of race.view.cars.entries()) {
      fleet.place(track, index, car.s);
    }
    showAt(s, () => true);
    const asOnMain = frame();
    showAt(s, inBox);
    const asBuilt = frame();
    const actors = actorsIn(world.scene, fleet.group).filter(
      (mesh) => mesh.visible && mesh.count > 0
    );
    const followed = viewOf(sun);
    const box = new THREE.Frustum().setFromProjectionMatrix(followed);
    const loose = new THREE.Sphere();
    const sent = shadowTriangles(actors);
    for (const mesh of actors) {
      mesh.castShadow = false;
    }
    const unshadowed = frame();
    for (const mesh of actors) {
      mesh.castShadow = true;
    }
    return {
      actorShadowPixels: pixelsApart(asBuilt, unshadowed),
      changedFromMain: pixelsApart(asOnMain, asBuilt),
      drawn: instancesWhere(actors, () => true),
      loose: instancesWhere(actors, (sphere) =>
        box.intersectsSphere(
          loose.set(sphere.center, sphere.radius + LOOSE_MARGIN)
        )
      ),
      reaching: instancesWhere(actors, (sphere) =>
        box.intersectsSphere(sphere)
      ),
      s,
      sameShadowCamera: drawnWith.equals(followed),
      submitted: sent,
    };
  });
  fleet.dispose();
  world.dispose();
  renderer.dispose();
  release();
  const wrong = results.filter(
    (place) =>
      !place.sameShadowCamera ||
      place.changedFromMain > 0 ||
      place.submitted < place.reaching ||
      place.submitted > place.loose ||
      place.loose >= place.drawn
  );
  const seen = results.some((place) => place.actorShadowPixels > 0);
  if (wrong.length > 0 || !seen || notes.length > 0) {
    throw new Error(
      `Shadow casters out of step: ${JSON.stringify({ notes, seen, wrong })}`
    );
  }
  return results;
};
