import * as THREE from "three";

import type { Tone } from "./cel.ts";
import { lookOf } from "./looks.ts";
import type { Look } from "./looks.ts";

const KEY: Look["keyDirection"] = [0.22, 0.8, 0.56];

export const duskLook: Look = {
  ...lookOf("salt-coast"),
  bloom: 0.42,
  grade: [1.04, 0.98, 1.03],
  ink: "#1c0730",
  keyDirection: KEY,
  lit: [1.06, 0.9, 0.84],
  rim: "#ffd27a",
  rimDirection: [-0.92, 0.3, 0.2],
  shadow: [0.66, 0.5, 0.74],
};

export const nightLook: Look = {
  ...lookOf("lowtown"),
  backdrop: "#1c1f74",
  bloom: 0.5,
  grade: [1, 0.97, 1.06],
  ink: "#10041f",
  keyDirection: KEY,
  lit: [0.86, 0.68, 0.86],
  rim: "#ff2bd6",
  rimDirection: [0.6, 0.2, -0.8],
  shadow: [0.4, 0.3, 0.6],
  sky: [
    [0, "#07082a"],
    [0.45, "#141663"],
    [0.75, "#3a2a8a"],
    [1, "#8a3a9a"],
  ],
};

type Triple = readonly [number, number, number];

const mixTriple = (from: Triple, to: Triple, at: number): Triple => [
  THREE.MathUtils.lerp(from[0], to[0], at),
  THREE.MathUtils.lerp(from[1], to[1], at),
  THREE.MathUtils.lerp(from[2], to[2], at),
];

const from = new THREE.Color();
const to = new THREE.Color();

const mixColour = (start: string, end: string, at: number): string =>
  `#${from.set(start).lerp(to.set(end), at).getHexString()}`;

export interface BarTone extends Tone {
  readonly bloom: number;
  readonly grade: Triple;
  readonly ink: string;
  readonly neon: number;
}

const NEON_AT_DUSK = 0.86;
const NEON_AT_NIGHT = 1.12;

export const toneAt = (time: number): BarTone => ({
  bloom: THREE.MathUtils.lerp(duskLook.bloom, nightLook.bloom, time),
  grade: mixTriple(duskLook.grade, nightLook.grade, time),
  ink: mixColour(duskLook.ink, nightLook.ink, time),
  lit: mixTriple(duskLook.lit, nightLook.lit, time),
  neon: THREE.MathUtils.lerp(NEON_AT_DUSK, NEON_AT_NIGHT, time),
  rim: mixColour(duskLook.rim, nightLook.rim, time),
  rimDirection: mixTriple(duskLook.rimDirection, nightLook.rimDirection, time),
  shadow: mixTriple(duskLook.shadow, nightLook.shadow, time),
});
