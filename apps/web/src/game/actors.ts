import type { TrafficCar } from "@racer/sim/state";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { placeOnGround } from "./world.ts";

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };

export const HIP_HEIGHT = 1.02;
export const HIP_SETBACK = 0.22;

function matte(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function block(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  pitch = 0
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.x = pitch;
  parent.add(mesh);
  return mesh;
}

function wheel(
  parent: THREE.Object3D,
  material: THREE.Material,
  radius: number,
  width: number,
  z: number
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radius, radius, width, 12);
  geometry.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, radius, z);
  parent.add(mesh);
  return mesh;
}

export interface BikeModel {
  readonly root: THREE.Group;
  readonly shadow: THREE.Mesh;
  spin: (distance: number) => void;
}

export function createBike(): BikeModel {
  const root = new THREE.Group();
  const paint = matte(0xc8_2f_2f);
  const metal = matte(0x2b_2e_33);
  const rubber = matte(0x15_16_18);

  const rear = wheel(root, rubber, 0.32, 0.17, 0.72);
  const front = wheel(root, rubber, 0.31, 0.13, -0.74);
  block(root, metal, [0.3, 0.36, 0.72], [0, 0.52, 0.02]);
  block(root, paint, [0.34, 0.24, 0.52], [0, 0.88, -0.14]);
  block(root, metal, [0.26, 0.1, 0.5], [0, 0.86, 0.36]);
  block(root, paint, [0.22, 0.14, 0.34], [0, 0.94, 0.72], 0.25);
  block(root, metal, [0.09, 0.72, 0.09], [0, 0.66, -0.62], -0.42);
  block(root, paint, [0.36, 0.32, 0.26], [0, 1, -0.58], -0.3);
  block(root, metal, [0.64, 0.05, 0.05], [0, 1.08, -0.44]);
  block(root, metal, [0.1, 0.1, 0.7], [0.2, 0.42, 0.5], 0.12);
  block(
    root,
    new THREE.MeshBasicMaterial({ color: 0xff_3b_30 }),
    [0.16, 0.06, 0.03],
    [0, 0.97, 0.9]
  );

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 16),
    new THREE.MeshBasicMaterial({
      color: 0x0c_0e_10,
      depthWrite: false,
      opacity: 0.32,
      transparent: true,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(0.55, 1.25, 1);

  return {
    root,
    shadow,
    spin(distance) {
      rear.rotation.x -= distance / 0.32;
      front.rotation.x -= distance / 0.31;
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
  0xd9_d4_c7, 0x3d_6f_b5, 0xb8_3a_32, 0x2f_8f_6b, 0xe0_a4_3a, 0x55_5c_66,
];

interface FleetPart {
  readonly mesh: THREE.InstancedMesh;
  readonly local: readonly THREE.Matrix4[];
}

export interface Fleet {
  readonly group: THREE.Group;
  place: (track: Track, index: number, s: number) => void;
  commit: () => void;
}

export function createFleet(cars: readonly TrafficCar[]): Fleet {
  const group = new THREE.Group();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const count = cars.length;
  const scratch = new THREE.Object3D();

  const part = (
    material: THREE.Material,
    layout: (
      car: TrafficCar
    ) => readonly [number, number, number, number, number]
  ): FleetPart => {
    const mesh = new THREE.InstancedMesh(unit, material, count);
    mesh.frustumCulled = false;
    group.add(mesh);
    const local = cars.map((car) => {
      const [width, height, length, y, z] = layout(car);
      scratch.position.set(0, y, z);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(width, height, length);
      scratch.updateMatrix();
      return scratch.matrix.clone();
    });
    return { local, mesh };
  };

  const bodyMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
  const body = part(bodyMaterial, (car) => {
    const boxy = car.height > 1.8;
    const height = boxy ? car.height - 0.45 : car.height * 0.5;
    return [
      car.halfWidth * 2,
      height,
      car.halfLength * 2,
      0.35 + height / 2,
      0,
    ];
  });
  const cabin = part(matte(0x1c_23_2b), (car) => {
    const boxy = car.height > 1.8;
    if (boxy) {
      return [
        car.halfWidth * 1.9,
        car.height * 0.24,
        0.1,
        car.height * 0.62,
        -car.halfLength - 0.02,
      ];
    }
    return [
      car.halfWidth * 1.75,
      car.height * 0.36,
      car.halfLength * 0.95,
      0.35 + car.height * 0.5 + car.height * 0.18,
      car.halfLength * 0.12,
    ];
  });
  const under = part(matte(0x12_13_15), (car) => [
    car.halfWidth * 2.02,
    0.42,
    car.halfLength * 1.7,
    0.24,
    0,
  ]);
  const headlights = part(
    new THREE.MeshBasicMaterial({ color: 0xff_f6_d8 }),
    (car) => [car.halfWidth * 1.7, 0.14, 0.06, 0.72, -car.halfLength]
  );
  const taillights = part(
    new THREE.MeshBasicMaterial({ color: 0xe5_2b_22 }),
    (car) => [car.halfWidth * 1.7, 0.12, 0.06, 0.78, car.halfLength]
  );
  const parts = [body, cabin, under, headlights, taillights];

  const color = new THREE.Color();
  for (const [index, car] of cars.entries()) {
    body.mesh.setColorAt(index, color.setHex(paints[car.paint] ?? 0x88_88_88));
  }

  const base = new THREE.Object3D();
  const world = new THREE.Matrix4();
  const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };

  return {
    commit() {
      for (const each of parts) {
        each.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    group,
    place(track, index, s) {
      const car = cars[index];
      if (!car) {
        return;
      }
      placeOnGround(track, s, car.x, point);
      base.position.set(point.x, point.y, point.z);
      const oncoming = car.cruiseSpeed < 0;
      base.rotation.set(
        Math.atan(point.slope) * (oncoming ? -1 : 1),
        -point.heading + (oncoming ? Math.PI : 0),
        0,
        "YXZ"
      );
      base.updateMatrix();
      for (const each of parts) {
        const local = each.local[index];
        if (local) {
          world.multiplyMatrices(base.matrix, local);
          each.mesh.setMatrixAt(index, world);
        }
      }
    },
  };
}
