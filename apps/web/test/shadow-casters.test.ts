import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { TrafficView } from "@racer/sim/race-view";
import { trackFor } from "@racer/track/roads";
import type { TrackPoint } from "@racer/track/track";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createShading } from "../src/game/cel.ts";
import { createFleet } from "../src/game/fleet.ts";
import { placeOnGround } from "../src/game/ground.ts";
import { lookOf } from "../src/game/looks.ts";
import { isInstancedMesh } from "../src/game/meshes.ts";
import { shadowReachOf } from "../src/game/shadow-reach.ts";
import { pinnedAssets } from "./pinned-assets.ts";

const track = trackFor("breakwater-run");
const HALF_BOX = 5;
const STRAIGHT_AT = 1900;
const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };

const sunOver = (focus: THREE.Vector3): THREE.DirectionalLight => {
  const light = new THREE.DirectionalLight();
  const { camera } = light.shadow;
  camera.left = -HALF_BOX;
  camera.right = HALF_BOX;
  camera.top = HALF_BOX;
  camera.bottom = -HALF_BOX;
  camera.near = 1;
  camera.far = 600;
  camera.updateProjectionMatrix();
  light.target.position.copy(focus);
  light.position.copy(focus).add(new THREE.Vector3(20, 300, 10));
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  light.shadow.updateMatrices(light);
  return light;
};

const lightSpaceOf = (
  light: THREE.DirectionalLight,
  at: THREE.Vector3
): THREE.Vector3 =>
  at.clone().applyMatrix4(light.shadow.camera.matrixWorldInverse);

const groundAt = (s: number, x: number): THREE.Vector3 => {
  placeOnGround(track, s, x, point);
  return new THREE.Vector3(point.x, point.y, point.z);
};

const outsideBy = (
  light: THREE.DirectionalLight,
  at: THREE.Vector3
): number => {
  const local = lightSpaceOf(light, at);
  return Math.max(Math.abs(local.x), Math.abs(local.y)) - HALF_BOX;
};

describe("the shadow box's reach", () => {
  it("takes a point inside the box, one just outside within its radius, and nothing farther", () => {
    const focus = groundAt(STRAIGHT_AT, 0);
    const light = sunOver(focus);
    const reach = shadowReachOf(light);
    const edge = new THREE.Vector3(HALF_BOX + 1, 0, -300).applyMatrix4(
      light.shadow.camera.matrixWorld
    );
    const beyond = new THREE.Vector3(HALF_BOX + 40, 0, -300).applyMatrix4(
      light.shadow.camera.matrixWorld
    );
    const deep = new THREE.Vector3(0, 0, -700).applyMatrix4(
      light.shadow.camera.matrixWorld
    );
    expect([
      reach.reaches(focus, 0),
      reach.reaches(edge, 0),
      reach.reaches(edge, 2),
      reach.reaches(beyond, 2),
      reach.reaches(deep, 2),
    ]).toStrictEqual([true, false, true, false, false]);
  });
});

describe("the fleet's shadow casters", () => {
  it("writes the cars that reach the shadow box first, a car just outside whose shadow falls inside among them", async () => {
    const assets = await pinnedAssets();
    const shading = createShading(lookOf(track.plan.region));
    const race = createRaceRun(defaultSetup(track, 3));
    const template = race.view.cars.find(
      (car) => !car.carrier && car.height <= 1.8
    );
    if (!template) {
      throw new Error("The race has no plain car.");
    }
    const focus = groundAt(STRAIGHT_AT, template.x);
    const light = sunOver(focus);
    let justOutside = STRAIGHT_AT;
    while (outsideBy(light, groundAt(justOutside, template.x)) < 0.5) {
      justOutside += 0.1;
    }
    const places = [STRAIGHT_AT + 300, justOutside, STRAIGHT_AT];
    const cars: TrafficView[] = places.map((s) => ({ ...template, s }));
    const fleet = createFleet(assets, shading, cars, []);
    for (const [index, s] of places.entries()) {
      fleet.place(track, index, s);
    }
    fleet.commit(STRAIGHT_AT - 10, shadowReachOf(light));
    const body = fleet.group.children.find(
      (node) => isInstancedMesh(node) && node.castShadow && node.count > 0
    );
    if (!body || !isInstancedMesh(body)) {
      throw new Error("The fleet drew no shadow-casting car.");
    }
    const matrix = new THREE.Matrix4();
    const written = Array.from({ length: body.count }, (_, slot) => {
      body.getMatrixAt(slot, matrix);
      const at = new THREE.Vector3().setFromMatrixPosition(matrix);
      return places.findIndex(
        (s) => groundAt(s, template.x).distanceTo(at) < 0.01
      );
    });
    expect(outsideBy(light, groundAt(justOutside, template.x))).toBeGreaterThan(
      0
    );
    expect(written.slice(0, 2).toSorted((a, b) => a - b)).toStrictEqual([1, 2]);
    expect(written[2]).toBe(0);
    fleet.dispose();
    shading.dispose();
  });
});
