import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { KERB_HEIGHT } from "./city.ts";
import { lookOf } from "./looks.ts";
import type { Kit } from "./looks.ts";

export const KERB_WIDTH = 0.3;

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const placer = new THREE.Object3D();

export function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function rolling(worldX: number, worldZ: number): number {
  return (
    Math.sin(worldX * 0.011 + 1.3) * Math.cos(worldZ * 0.013) +
    0.5 * Math.sin(worldX * 0.031 - worldZ * 0.027)
  );
}

export function groundLift(
  kit: Kit,
  distance: number,
  worldX: number,
  worldZ: number
): number {
  if (distance <= 0) {
    return 0;
  }
  if (kit === "city") {
    return KERB_HEIGHT * Math.min(1, distance / KERB_WIDTH);
  }
  const ditch =
    -0.35 * smoothstep(distance / 1.5) * (1 - smoothstep((distance - 4) / 6));
  const rise = smoothstep((distance - 9) / 90);
  return ditch + rise * (6 + 16 * rolling(worldX, worldZ));
}

export function placeOnGround(
  track: Track,
  s: number,
  x: number,
  target: TrackPoint
): void {
  placeOnTrack(track, s, x, target);
  target.y += groundLift(
    lookOf(track.plan.region).kit,
    Math.abs(x) - track.roadHalfWidth,
    target.x,
    target.z
  );
}

export interface Placement {
  readonly s: number;
  readonly x: number;
  readonly scale: number;
}

export interface Part {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
}

export const lifted = (
  geometry: THREE.BufferGeometry,
  at: readonly [number, number, number]
): THREE.BufferGeometry => geometry.translate(...at);

export const whiteInstances = (mesh: THREE.InstancedMesh): void => {
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(mesh.count * 3).fill(1),
    3
  );
};

export function plant(
  group: THREE.Group,
  track: Track,
  placements: readonly Placement[],
  parts: readonly Part[],
  mirrored = false
): void {
  if (placements.length === 0) {
    for (const part of parts) {
      part.geometry.dispose();
      part.material.dispose();
    }
    return;
  }
  const meshes = parts.map((part) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      part.material,
      placements.length
    );
    const lit = !(part.material instanceof THREE.MeshBasicMaterial);
    mesh.castShadow = lit;
    mesh.receiveShadow = lit;
    whiteInstances(mesh);
    group.add(mesh);
    return mesh;
  });
  for (const [index, placement] of placements.entries()) {
    placeOnGround(track, placement.s, placement.x, point);
    placer.position.set(point.x, point.y, point.z);
    placer.rotation.set(0, -point.heading, 0);
    const flip = mirrored && placement.x > 0 ? -1 : 1;
    placer.scale.set(placement.scale * flip, placement.scale, placement.scale);
    placer.updateMatrix();
    for (const mesh of meshes) {
      mesh.setMatrixAt(index, placer.matrix);
    }
  }
  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}
