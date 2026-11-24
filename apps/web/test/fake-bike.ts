import * as THREE from "three";

import type { BikeModel } from "../src/game/assets.ts";
import { bikePostures } from "../src/game/bike-posture.ts";
import type { Primitive } from "../src/game/model-slots.ts";

const nowhere = new THREE.Vector3();
export const fakeBike = (): BikeModel => ({
  fit: {
    foot_l: nowhere,
    foot_r: nowhere,
    hand_l: nowhere,
    hand_r: nowhere,
    model: "classic",
    posture: bikePostures.classic,
    seat: nowhere,
  },
  parts: new Map<string, readonly Primitive[]>(),
});
