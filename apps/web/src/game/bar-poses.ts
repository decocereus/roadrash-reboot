import * as THREE from "three";

import type { Turn } from "./figure-pose.ts";

const FORWARD = new THREE.Vector3(-1, 0, 0);
const RAISE = new THREE.Vector3(1, 0, 0);
const ROLL = new THREE.Vector3(0, 0, 1);
const YAW = new THREE.Vector3(0, 1, 0);

export const poseTurns = {
  arms: [
    { axis: RAISE, bone: "upperarm_l", degrees: 16 },
    { axis: RAISE, bone: "upperarm_r", degrees: 16 },
    { axis: ROLL, bone: "upperarm_l", degrees: -12 },
    { axis: ROLL, bone: "upperarm_r", degrees: 12 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 82 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 90 },
    { axis: YAW, bone: "lowerarm_l", degrees: -72 },
    { axis: YAW, bone: "lowerarm_r", degrees: 72 },
    { axis: FORWARD, bone: "spine_03", degrees: -4 },
  ],
  chat: [
    { axis: RAISE, bone: "upperarm_r", degrees: 32 },
    { axis: ROLL, bone: "upperarm_r", degrees: 12 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 62 },
    { axis: YAW, bone: "lowerarm_r", degrees: -24 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 16 },
    { axis: ROLL, bone: "upperarm_l", degrees: -6 },
    { axis: YAW, bone: "spine_03", degrees: 10 },
  ],
  lean: [
    { axis: ROLL, bone: "pelvis", degrees: 5 },
    { axis: FORWARD, bone: "spine_01", degrees: -6 },
    { axis: FORWARD, bone: "spine_02", degrees: -6 },
    { axis: RAISE, bone: "upperarm_l", degrees: -34 },
    { axis: RAISE, bone: "upperarm_r", degrees: -34 },
    { axis: ROLL, bone: "upperarm_l", degrees: -18 },
    { axis: ROLL, bone: "upperarm_r", degrees: 18 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 36 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 36 },
    { axis: FORWARD, bone: "head", degrees: 4 },
  ],
  phone: [
    { axis: RAISE, bone: "upperarm_r", degrees: 26 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 92 },
    { axis: YAW, bone: "lowerarm_r", degrees: 34 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 18 },
    { axis: ROLL, bone: "upperarm_l", degrees: -5 },
    { axis: FORWARD, bone: "neck_01", degrees: 12 },
    { axis: FORWARD, bone: "head", degrees: 14 },
    { axis: YAW, bone: "head", degrees: 8 },
  ],
  relaxed: [
    { axis: RAISE, bone: "lowerarm_l", degrees: 16 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 16 },
    { axis: ROLL, bone: "upperarm_l", degrees: -5 },
    { axis: ROLL, bone: "upperarm_r", degrees: 5 },
  ],
  shove: [
    { axis: RAISE, bone: "upperarm_l", degrees: 74 },
    { axis: RAISE, bone: "upperarm_r", degrees: 74 },
    { axis: RAISE, bone: "lowerarm_l", degrees: 14 },
    { axis: RAISE, bone: "lowerarm_r", degrees: 14 },
    { axis: FORWARD, bone: "spine_01", degrees: 8 },
    { axis: FORWARD, bone: "spine_02", degrees: 8 },
  ],
} as const satisfies Record<string, readonly Turn[]>;

export const breathTurns: readonly Turn[] = [
  { axis: FORWARD, bone: "spine_02", degrees: 1.6 },
  { axis: FORWARD, bone: "spine_03", degrees: 1.3 },
  { axis: ROLL, bone: "spine_01", degrees: 1.4 },
  { axis: YAW, bone: "neck_01", degrees: 11 },
  { axis: YAW, bone: "head", degrees: 9 },
];
