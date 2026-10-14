import { riderPalette } from "@racer/sim/palette";
import type { TrafficCar } from "@racer/sim/state";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { paintPrimitives } from "./assets.ts";
import type { Assets, Palette, Primitive } from "./assets.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { placeOnGround, whiteInstances } from "./ground.ts";

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };

const DEFAULT_PAINT = 0xc8_2f_2f;
const DARK_TRIM = "#1c1826";
const WHEELS = [
  ["wheel_f", 0.293, 0.69],
  ["wheel_r", 0.306, -0.69],
] as const;

export interface BikeModel {
  readonly root: THREE.Group;
  spin: (distance: number) => void;
  dispose: () => void;
}

const lit = <Target extends THREE.Object3D>(target: Target): Target => {
  target.castShadow = true;
  target.receiveShadow = true;
  return target;
};

const addPainted = (
  parent: THREE.Object3D,
  primitives: readonly Primitive[],
  palette: Palette,
  shading: Shading,
  shift: readonly [number, number, number] = [0, 0, 0]
): void => {
  const painted = paintPrimitives(primitives, palette);
  if (painted.cel) {
    painted.cel.translate(...shift);
    parent.add(lit(new THREE.Mesh(painted.cel, shading.paint())));
  }
  if (painted.glow) {
    painted.glow.translate(...shift);
    parent.add(new THREE.Mesh(painted.glow, shading.glowPaint()));
  }
};

const beaconLight = (
  parent: THREE.Object3D,
  shading: Shading,
  colour: number,
  x: number
): void => {
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.08, 0.1),
    shading.glow(colour, 2.4)
  );
  lamp.position.set(x, 1.02, -0.92);
  parent.add(lamp);
};

export function createBike(
  assets: Assets,
  shading: Shading,
  paintIndex: number,
  beacon = false
): BikeModel {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.y = Math.PI;
  root.add(model);
  const colours = riderPalette[paintIndex];
  const palette: Palette = new Map<string, THREE.ColorRepresentation>([
    ["body", colours?.bike ?? DEFAULT_PAINT],
    ["accent", colours?.trim ?? DARK_TRIM],
  ]);
  addPainted(model, assets.bike.get("bike_body") ?? [], palette, shading);
  const pivots = WHEELS.map(([name, radius, z]) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, radius, z);
    addPainted(pivot, assets.bike.get(name) ?? [], palette, shading, [
      0,
      -radius,
      -z,
    ]);
    model.add(pivot);
    return { pivot, radius };
  });
  if (beacon) {
    beaconLight(model, shading, 0x2f_6b_ff, -0.07);
    beaconLight(model, shading, 0xff_2f_3a, 0.07);
  }

  return {
    dispose() {
      disposeTree(root);
    },
    root,
    spin(distance) {
      for (const { pivot, radius } of pivots) {
        pivot.rotation.x += distance / radius;
      }
    },
  };
}

export function poseOnTrack(
  target: THREE.Object3D,
  track: Track,
  s: number,
  x: number,
  lift: number,
  yaw: number,
  roll: number,
  pitch: number
): void {
  placeOnGround(track, s, x, point);
  target.position.set(point.x, point.y + lift, point.z);
  target.rotation.set(
    Math.atan(point.slope) + pitch,
    -(point.heading + yaw),
    -roll,
    "YXZ"
  );
}

const paints = [
  0xe8_e2_d6, 0x2f_6f_d0, 0xc8_32_3c, 0x2f_8f_6b, 0xd8_a0_20, 0x3a_35_50,
];
const BOXY_HEIGHT = 1.8;
const WHITE: Palette = new Map([["body", "#ffffff"]]);
const NO_PAINT: Palette = new Map();

interface FleetPart {
  readonly mesh: THREE.InstancedMesh;
  readonly cars: readonly number[];
}

export interface Fleet {
  readonly group: THREE.Group;
  place: (track: Track, index: number, s: number) => void;
  commit: () => void;
  dispose: () => void;
}

const sizeOf = (primitives: readonly Primitive[]): THREE.Vector3 => {
  const bounds = new THREE.Box3();
  for (const primitive of primitives) {
    primitive.geometry.computeBoundingBox();
    if (primitive.geometry.boundingBox) {
      bounds.union(primitive.geometry.boundingBox);
    }
  }
  return bounds.getSize(new THREE.Vector3());
};

export function createFleet(
  assets: Assets,
  shading: Shading,
  cars: readonly TrafficCar[]
): Fleet {
  const group = new THREE.Group();
  const parts: FleetPart[] = [];
  const local: THREE.Matrix4[] = cars.map(() => new THREE.Matrix4());
  const slotOf: number[] = cars.map(() => 0);
  const scratch = new THREE.Object3D();
  const color = new THREE.Color();

  const muster = (primitives: readonly Primitive[], boxy: boolean): void => {
    const members = cars
      .map((car, index) => ({ car, index }))
      .filter(({ car }) => car.height > BOXY_HEIGHT === boxy);
    if (members.length === 0) {
      return;
    }
    const size = sizeOf(primitives);
    for (const [slot, { car, index }] of members.entries()) {
      scratch.position.set(0, 0, 0);
      scratch.rotation.set(0, Math.PI, 0);
      scratch.scale.set(
        (car.halfWidth * 2) / size.x,
        car.height / size.y,
        (car.halfLength * 2) / size.z
      );
      scratch.updateMatrix();
      local[index]?.copy(scratch.matrix);
      slotOf[index] = slot;
    }
    const indices = members.map(({ index }) => index);
    const body = paintPrimitives(
      primitives.filter((primitive) => primitive.slot === "body"),
      WHITE
    );
    const rest = paintPrimitives(
      primitives.filter((primitive) => primitive.slot !== "body"),
      NO_PAINT
    );
    const instanced = (
      geometry: THREE.BufferGeometry | null,
      material: THREE.Material,
      shadows: boolean
    ): THREE.InstancedMesh | null => {
      if (!geometry) {
        material.dispose();
        return null;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, members.length);
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      whiteInstances(mesh);
      group.add(mesh);
      parts.push({ cars: indices, mesh });
      return mesh;
    };
    const shell = instanced(body.cel, shading.paint(), true);
    instanced(rest.cel, shading.paint(), true);
    instanced(rest.glow, shading.glowPaint(), false);
    if (shell) {
      for (const [slot, { car }] of members.entries()) {
        shell.setColorAt(slot, color.setHex(paints[car.paint] ?? 0x88_88_88));
      }
    }
  };

  muster(assets.car, false);
  muster(assets.van, true);

  const base = new THREE.Object3D();
  const world = new THREE.Matrix4();
  const spot: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
  const placed: THREE.Matrix4[] = cars.map(() => new THREE.Matrix4());

  return {
    commit() {
      for (const part of parts) {
        for (const index of part.cars) {
          const matrix = placed[index];
          if (matrix) {
            part.mesh.setMatrixAt(slotOf[index] ?? 0, matrix);
          }
        }
        part.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      disposeTree(group);
    },
    group,
    place(track, index, s) {
      const car = cars[index];
      const fit = local[index];
      if (!(car && fit)) {
        return;
      }
      placeOnGround(track, s, car.x, spot);
      base.position.set(spot.x, spot.y, spot.z);
      const oncoming = car.cruiseSpeed < 0;
      base.rotation.set(
        Math.atan(spot.slope) * (oncoming ? -1 : 1),
        -spot.heading + (oncoming ? Math.PI : 0),
        0,
        "YXZ"
      );
      base.updateMatrix();
      placed[index]?.copy(world.multiplyMatrices(base.matrix, fit));
    },
  };
}
