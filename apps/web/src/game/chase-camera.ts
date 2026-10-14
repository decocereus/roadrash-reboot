import { heightAt } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { placeOnGround } from "./ground.ts";

const FIELD_OF_VIEW = 48;
const FIELD_OF_VIEW_AT_SPEED = 57;
const FULL_SPEED = 75;
const SHAKE_FROM_SPEED = 38;
const SHAKE_FULL_SPEED = 78;
const SPEED_SHAKE = 0.035;
const TUCK_DROP = 0.24;
const TUCK_FOLLOW = 4;
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
  speed: number;
  tuck: number;
}

export interface ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  resize: (width: number, height: number) => void;
  jolt: (strength: number) => void;
  snap: () => void;
  update: (track: Track, subject: Subject, seconds: number) => void;
}

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function createChaseCamera(): ChaseCamera {
  const rig = frameRig();
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.3, 6000);
  camera.rotation.order = "YXZ";
  const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
  let sideways = 0;
  let height = 0;
  let shake = 0;
  let rush = 0;
  let tuck = 0;
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
      tuck += (subject.tuck - tuck) * Math.min(1, seconds * TUCK_FOLLOW);
      const wantedHeight =
        heightAt(track, subject.s) +
        rig.height +
        subject.air * AIR_FOLLOW -
        TUCK_DROP * tuck;
      height += (wantedHeight - height) * follow;
      rush += (smoothstep(0, FULL_SPEED, subject.speed) - rush) * follow;
      camera.fov =
        FIELD_OF_VIEW + (FIELD_OF_VIEW_AT_SPEED - FIELD_OF_VIEW) * rush;
      camera.updateProjectionMatrix();

      placeOnGround(track, subject.s, sideways, point);
      const backX = point.x - Math.sin(point.heading) * rig.distance;
      const backZ = point.z + Math.cos(point.heading) * rig.distance;
      const floor =
        heightAt(track, subject.s - rig.distance) + GROUND_CLEARANCE;
      shake = Math.max(0, shake - seconds * 2.4);
      const buffet = smoothstep(
        SHAKE_FROM_SPEED,
        SHAKE_FULL_SPEED,
        subject.speed
      );
      const tremor = shake * 0.16 + buffet * buffet * SPEED_SHAKE;
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
