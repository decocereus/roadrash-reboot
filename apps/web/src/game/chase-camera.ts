import { heightAt } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { placeOnGround } from "./ground.ts";

const FIELD_OF_VIEW = 48;
const HORIZON_DOWN_FRAME = 0.34;
const RIDER_BASE_DOWN_FRAME = 0.685;
const RIDER_HEIGHT_IN_FRAME = 0.27;
const RIDER_TOP = 1.85;
const REAR_WHEEL_BEHIND = 0.75;
const SIDEWAYS_FOLLOW = 0.75;
const AIR_FOLLOW = 0.25;
const GROUND_CLEARANCE = 0.6;

interface Rig {
  readonly pitch: number;
  readonly distance: number;
  readonly height: number;
}

const frameRig = (): Rig => {
  const span = 2 * Math.tan(THREE.MathUtils.degToRad(FIELD_OF_VIEW) / 2);
  const pitch = Math.atan(span * (0.5 - HORIZON_DOWN_FRAME));
  const toBase = pitch + Math.atan(span * (RIDER_BASE_DOWN_FRAME - 0.5));
  const toTop =
    pitch +
    Math.atan(span * (RIDER_BASE_DOWN_FRAME - RIDER_HEIGHT_IN_FRAME - 0.5));
  const distance =
    (RIDER_TOP + REAR_WHEEL_BEHIND * Math.tan(toBase)) /
    (Math.tan(toBase) - Math.tan(toTop));
  return {
    distance,
    height: (distance - REAR_WHEEL_BEHIND) * Math.tan(toBase),
    pitch,
  };
};

export interface Subject {
  s: number;
  x: number;
  air: number;
}

export interface ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  resize: (width: number, height: number) => void;
  jolt: (strength: number) => void;
  snap: () => void;
  update: (track: Track, subject: Subject, seconds: number) => void;
}

export function createChaseCamera(): ChaseCamera {
  const rig = frameRig();
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.3, 6000);
  camera.rotation.order = "YXZ";
  const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
  let sideways = 0;
  let height = 0;
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
      const follow = settled ? Math.min(1, seconds * 12) : 1;
      sideways += (subject.x * SIDEWAYS_FOLLOW - sideways) * follow;
      const wantedHeight =
        heightAt(track, subject.s) + rig.height + subject.air * AIR_FOLLOW;
      height += (wantedHeight - height) * follow;

      placeOnGround(track, subject.s, sideways, point);
      const backX = point.x - Math.sin(point.heading) * rig.distance;
      const backZ = point.z + Math.cos(point.heading) * rig.distance;
      const floor =
        heightAt(track, subject.s - rig.distance) + GROUND_CLEARANCE;
      shake = Math.max(0, shake - seconds * 2.4);
      const tremor = shake * 0.16;
      camera.position.set(
        backX + (Math.random() - 0.5) * tremor,
        Math.max(height, floor) + (Math.random() - 0.5) * tremor,
        backZ
      );
      camera.rotation.set(-rig.pitch, -point.heading, 0);
      settled = true;
    },
  };
}
