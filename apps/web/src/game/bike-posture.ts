import * as THREE from "three";

import type { BikeModelId } from "./bike-models.ts";

export interface BikePosture {
  readonly restPitch: number;
  readonly tuckPitch: number;
  readonly tuckSlide: THREE.Vector3;
}

const TUCK_SLIDE_BACK = 0.12;

const posture = (
  restPitch: number,
  tuckPitch: number,
  seatRise: number
): BikePosture => ({
  restPitch,
  tuckPitch,
  tuckSlide: new THREE.Vector3(0, seatRise, TUCK_SLIDE_BACK),
});

export const bikePostures = {
  classic: posture(-27.1, 30.2, 0.0116),
  ghost: posture(-10.7, 30.9, 0.0156),
  oni: posture(-16.6, 30.9, 0.0156),
  seraph: posture(-10.7, 30.9, 0.0156),
} satisfies Record<BikeModelId, BikePosture>;
