import { heightAt } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { placeOnGround } from "./world.ts";

const TOP_SPEED = 60;
const BASE_FOV = 60;
const SPEED_FOV = 16;

export interface Subject {
  s: number;
  x: number;
  air: number;
  speed: number;
  lean: number;
  rough: number;
}

export interface ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  resize: (width: number, height: number) => void;
  jolt: (strength: number) => void;
  snap: () => void;
  update: (track: Track, subject: Subject, seconds: number) => void;
}

export function createChaseCamera(): ChaseCamera {
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.3, 6000);
  const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
  const target = new THREE.Vector3();
  let sideways = 0;
  let height = 0;
  let roll = 0;
  let fov = BASE_FOV;
  let shake = 0;
  let settled = false;

  return {
    camera,
    jolt(strength) {
      shake = Math.min(1.2, shake + strength);
    },
    resize(width, height_) {
      camera.aspect = width / Math.max(1, height_);
      camera.updateProjectionMatrix();
    },
    snap() {
      settled = false;
    },
    update(track, subject, seconds) {
      const pace = Math.min(1, subject.speed / TOP_SPEED);
      const distance = 5.8 + 1.5 * pace;
      const follow = settled ? Math.min(1, seconds * 7) : 1;
      const cameraS = subject.s - distance;

      sideways += (subject.x * 0.82 - sideways) * follow;
      const wantedHeight =
        Math.max(heightAt(track, cameraS), heightAt(track, subject.s) - 0.4) +
        2.85 -
        0.25 * pace +
        subject.air * 0.55;
      height +=
        (wantedHeight - height) * (settled ? Math.min(1, seconds * 9) : 1);
      placeOnGround(track, cameraS, sideways, point);
      shake = Math.max(0, shake - seconds * 2.4);
      const tremor = shake * 0.22 + subject.rough * 0.05 + pace * pace * 0.012;
      camera.position.set(
        point.x + (Math.random() - 0.5) * tremor,
        Math.max(height, point.y + 1.1) + (Math.random() - 0.5) * tremor,
        point.z
      );

      placeOnGround(track, subject.s + 24 + 10 * pace, subject.x * 0.5, point);
      target.set(point.x, point.y + 1.3 + subject.air * 0.6, point.z);
      camera.lookAt(target);
      roll += (subject.lean * 0.1 - roll) * follow;
      camera.rotateZ(-roll);

      const wantedFov = BASE_FOV + SPEED_FOV * pace * pace;
      fov += (wantedFov - fov) * (settled ? Math.min(1, seconds * 3) : 1);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      settled = true;
    },
  };
}
