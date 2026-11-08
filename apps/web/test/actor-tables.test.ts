import { trafficPaints } from "@racer/sim/palette";
import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { TrafficView } from "@racer/sim/race-view";
import { weaponKinds } from "@racer/sim/state";
import type { WeaponKind } from "@racer/sim/state";
import { PAINT_COUNT } from "@racer/sim/traffic";
import { trackFor } from "@racer/track/roads";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createBikes } from "../src/game/actors.ts";
import type { Assets } from "../src/game/assets.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { bodyFor, paletteOf } from "../src/game/figure-rig.ts";
import { createFleet } from "../src/game/fleet.ts";
import { lookOf } from "../src/game/looks.ts";
import { isInstancedMesh } from "../src/game/meshes.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { Stance } from "../src/game/rider-figure.ts";
import { pinnedAssets } from "./pinned-assets.ts";

const track = trackFor("slag-row");
const ROLLED = 0.25;
const PIVOT_TOLERANCE = 0.0005;
const TURN_TOLERANCE = 0.001;

const instancedIn = (root: THREE.Object3D): THREE.InstancedMesh[] => {
  const meshes: THREE.InstancedMesh[] = [];
  root.traverse((node) => {
    if (isInstancedMesh(node)) {
      meshes.push(node);
    }
  });
  return meshes;
};

const seatedWith = (weapon: WeaponKind): Stance => ({
  flinch: 0,
  flinchSide: 1,
  lean: 0,
  pose: "seated",
  reach: 0,
  rise: 0,
  side: 1,
  speed: 0,
  time: 0,
  tuck: 0,
  weapon,
});

const heldIn = (hand: THREE.Object3D): THREE.Object3D[] =>
  hand.children.filter((child) => !(child instanceof THREE.Bone));

const boneOf = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const bone = root.getObjectByName(name);
  if (!bone) {
    throw new Error(`The rider has no ${name} bone.`);
  }
  return bone;
};

describe("weapons in a rider's hand", () => {
  it("draws every weapon the race can hand a rider as its own mesh, and warms every one in both hands", async () => {
    const assets = await pinnedAssets();
    const shading = createShading(lookOf(track.plan.region));
    const figure = createRiderFigure(bodyFor(assets, 0), shading, paletteOf(0));
    const left = boneOf(figure.root, "hand_l");
    const right = boneOf(figure.root, "hand_r");
    const drawn = weaponKinds.map((weapon) => {
      figure.animate(seatedWith(weapon), 1 / 60);
      return heldIn(right);
    });
    const held = weaponKinds.filter((kind) => kind !== "none");
    const unstage = figure.holdEveryWeapon();
    const staged = [heldIn(left).length, heldIn(right).length];
    unstage();
    expect({
      distinct: new Set(drawn.flat()).size,
      drawn: drawn.map((meshes) => meshes.length),
      staged,
    }).toStrictEqual({
      distinct: held.length,
      drawn: weaponKinds.map((kind) => (kind === "none" ? 0 : 1)),
      staged: [held.length, held.length],
    });
    figure.dispose();
    shading.dispose();
  });
});

const colourOf = (hex: number): number[] =>
  new THREE.Color().setHex(hex).toArray();

describe("traffic paint", () => {
  it("paints each car the colour of its paint, for every paint the sim can roll", async () => {
    const assets = await pinnedAssets();
    const shading = createShading(lookOf(track.plan.region));
    const race = createRaceRun(defaultSetup(track, 3));
    const template = race.view.cars.find((car) => !car.carrier);
    if (!template) {
      throw new Error("The race has no plain car.");
    }
    const cars: TrafficView[] = Array.from(
      { length: PAINT_COUNT },
      (_, paint) => ({ ...template, paint })
    );
    const fleet = createFleet(assets, shading, cars, []);
    for (let index = 0; index < cars.length; index += 1) {
      fleet.place(track, index, template.s);
    }
    fleet.commit(template.s);
    const drawn = instancedIn(fleet.group).map((mesh) => [
      ...(mesh.instanceColor?.array.slice(0, mesh.count * 3) ?? []),
    ]);
    expect(drawn).toContainEqual([
      ...Float32Array.from(trafficPaints.flatMap(colourOf)),
    ]);
    expect(() =>
      createFleet(assets, shading, [{ ...template, paint: PAINT_COUNT }], [])
    ).toThrow(`Traffic paint ${PAINT_COUNT} has no colour.`);
    fleet.dispose();
    shading.dispose();
  });
});

const boxOf = (mesh: THREE.InstancedMesh): THREE.Box3 => {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  const box = new THREE.Box3();
  const position = mesh.geometry.getAttribute("position");
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    box.expandByPoint(
      point.fromBufferAttribute(position, index).applyMatrix4(matrix)
    );
  }
  return box;
};

const farthestFrom = (
  mesh: THREE.InstancedMesh,
  centre: THREE.Vector3
): number => {
  const position = mesh.geometry.getAttribute("position");
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  const point = new THREE.Vector3();
  let farthest = 0;
  let reach = 0;
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index).applyMatrix4(matrix);
    const distance = Math.hypot(point.y - centre.y, point.z - centre.z);
    if (distance > reach) {
      reach = distance;
      farthest = index;
    }
  }
  return farthest;
};

const drawnVertex = (mesh: THREE.InstancedMesh, index: number) => {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  return new THREE.Vector3()
    .fromBufferAttribute(mesh.geometry.getAttribute("position"), index)
    .applyMatrix4(matrix);
};

const sweptAbout = (
  centre: THREE.Vector3,
  from: THREE.Vector3,
  to: THREE.Vector3
): number =>
  Math.abs(
    Math.atan2(
      (from.y - centre.y) * (to.z - centre.z) -
        (from.z - centre.z) * (to.y - centre.y),
      (from.y - centre.y) * (to.y - centre.y) +
        (from.z - centre.z) * (to.z - centre.z)
    )
  );

const MOVED_HUB = new THREE.Vector3(0, 0.08, 0.15);
const RESIZED = 1.2;

const moveEveryWheel = (assets: Assets): Assets => {
  for (const bike of Object.values(assets.bikes)) {
    for (const part of ["wheel_f", "wheel_r"]) {
      const primitives = bike.get(part) ?? [];
      const tyre = new THREE.Box3();
      for (const { geometry, slot } of primitives) {
        geometry.computeBoundingBox();
        if (slot === "tyre" && geometry.boundingBox) {
          tyre.union(geometry.boundingBox);
        }
      }
      const hub = tyre.getCenter(new THREE.Vector3());
      for (const { geometry } of primitives) {
        geometry
          .translate(0, -hub.y, -hub.z)
          .scale(1, RESIZED, RESIZED)
          .translate(0, hub.y + MOVED_HUB.y, hub.z + MOVED_HUB.z);
      }
    }
  }
  return assets;
};

describe("bike wheels", () => {
  it("turns each bike's wheels about their own tyres, one turn for each circumference rolled, wherever the model puts them", async () => {
    const assets = moveEveryWheel(await pinnedAssets());
    const shading = createShading(lookOf(track.plan.region));
    const turned = bikeModelIds.map((model) => {
      const bikes = createBikes(assets, shading, [
        { model, paint: 0, police: false },
      ]);
      bikes.show(0);
      bikes.commit(new THREE.Vector3());
      const before = instancedIn(bikes.group).map((mesh) => {
        const box = boxOf(mesh);
        const centre = box.getCenter(new THREE.Vector3());
        const vertex = farthestFrom(mesh, centre);
        return { box, centre, from: drawnVertex(mesh, vertex), mesh, vertex };
      });
      bikes.spin(0, ROLLED);
      bikes.show(0);
      bikes.commit(new THREE.Vector3());
      const parts = before.map(({ box, centre, from, mesh, vertex }) => ({
        moved: boxOf(mesh).getCenter(new THREE.Vector3()).distanceTo(centre),
        radius: (box.max.y - box.min.y) / 2,
        swept: sweptAbout(centre, from, drawnVertex(mesh, vertex)),
      }));
      bikes.dispose();
      const wheels = parts.filter(({ swept }) => swept > TURN_TOLERANCE);
      return {
        model,
        moved: Math.max(...parts.map(({ moved }) => moved)) < PIVOT_TOLERANCE,
        rolledTrue: wheels.every(
          ({ radius, swept }) =>
            Math.abs(swept - ROLLED / radius) < TURN_TOLERANCE
        ),
        wheels: wheels.length,
      };
    });
    expect(turned).toStrictEqual(
      bikeModelIds.map((model) => ({
        model,
        moved: true,
        rolledTrue: true,
        wheels: 2,
      }))
    );
    shading.dispose();
  });
});
