import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import { CYAN, ORANGE, YELLOW } from "./looks.ts";
import { geometryOf } from "./ramp-geometry.ts";
import type { Sheet } from "./ramp-geometry.ts";

const ACCENT_GLOW = 0.85;
const LIP_GLOW = 1.4;
const CHEVRON_GLOW = 1;
const SIGN_GLOW = 1.15;
const LAMP_GLOW = 2.4;
export const DECK = new THREE.Color("#3a404c");
export const GRIP = new THREE.Color("#717a8a");
export const RAIL = new THREE.Color("#c3c9d4");
export const FASCIA = new THREE.Color(YELLOW);
export const FRAME = new THREE.Color("#7c8494");
export const BRACE_COLOUR = new THREE.Color("#a5acba");
export const VOID = new THREE.Color("#07080b");
const STRIPE_DARK = new THREE.Color("#15171a");
export const POLE = new THREE.Color("#4a505c");
export const SIGN_BACK = new THREE.Color("#5a606c");
export const ACCENT = new THREE.Color(CYAN).multiplyScalar(ACCENT_GLOW);
export const LIP_ACCENT = new THREE.Color(CYAN).multiplyScalar(LIP_GLOW);
export const CHEVRON = new THREE.Color(YELLOW).multiplyScalar(CHEVRON_GLOW);
export const SIGN_FACE = new THREE.Color(YELLOW).multiplyScalar(SIGN_GLOW);
export const SIGN_INK = new THREE.Color("#050505");
export const LAMP = new THREE.Color(ORANGE).multiplyScalar(LAMP_GLOW);

export const stripeOf = (index: number, light: THREE.Color): THREE.Color =>
  index % 2 === 0 ? light : STRIPE_DARK;

export interface Materials {
  readonly cel: THREE.Material;
  readonly light: THREE.Material;
  readonly shade: THREE.Material;
}

export const meshesOf = (
  solid: Sheet,
  glow: Sheet,
  materials: Materials
): THREE.Group => {
  const body = new THREE.Mesh(geometryOf(solid), materials.cel);
  body.castShadow = true;
  body.receiveShadow = true;
  const group = new THREE.Group();
  group.add(body, onFxLayer(new THREE.Mesh(geometryOf(glow), materials.light)));
  return group;
};

export const shadowMaterial = (): THREE.MeshBasicMaterial => {
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    transparent: true,
    vertexColors: true,
  });
  return material;
};
