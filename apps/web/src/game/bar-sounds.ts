import * as THREE from "three";

import type { Cue } from "../sound/cues.ts";
import type { Sound } from "../sound/sound.ts";

const FEET_PER_CYCLE = 2;
const RUN_PACE = 5.6;
const OTHERS_HEARD = 2;
const OTHER_GAIN = 0.5;
const HEARING_RANGE = 10;
const WIDEST_PAN = 0.8;
const BED_GAIN = 0.5;

export const footfalls = (from: number, to: number): number =>
  Math.floor(to * FEET_PER_CYCLE) - Math.floor(from * FEET_PER_CYCLE);

const stepCue = (steps: number, pace: number): Cue | null => {
  if (steps <= 0) {
    return null;
  }
  return pace > RUN_PACE ? "runStep" : "walkStep";
};

const copyInto = (into: Heard, from: Heard): void => {
  into.away = from.away;
  into.cue = from.cue;
  into.x = from.x;
  into.z = from.z;
};

interface Heard {
  away: number;
  x: number;
  z: number;
  cue: Cue | null;
}

export interface BarSounds {
  readonly bed: (level: number) => void;
  readonly close: () => void;
  readonly listen: (
    x: number,
    z: number,
    camera: THREE.Camera,
    own: number
  ) => void;
  readonly foot: (
    slot: number | null,
    x: number,
    z: number,
    steps: number,
    pace: number
  ) => void;
  readonly mine: (cue: Cue) => void;
  readonly near: (cue: Cue, x: number, z: number) => void;
  readonly flush: () => void;
}

export const createBarSounds = (
  sound: Pick<Sound, "loop" | "play">
): BarSounds => {
  const right = new THREE.Vector3();
  const nearest: readonly [Heard, Heard] = [
    { away: Number.POSITIVE_INFINITY, cue: null, x: 0, z: 0 },
    { away: Number.POSITIVE_INFINITY, cue: null, x: 0, z: 0 },
  ];
  let listenerX = 0;
  let listenerZ = 0;
  let ownSlot = 0;
  let ownStep: Cue | null = null;

  const playAt = (cue: Cue, x: number, z: number, gain: number): void => {
    const dx = x - listenerX;
    const dz = z - listenerZ;
    const away = Math.hypot(dx, dz);
    const fade = Math.max(0, 1 - away / HEARING_RANGE);
    if (fade <= 0) {
      return;
    }
    const side = (dx * right.x + dz * right.z) / Math.max(1, away);
    sound.play(
      cue,
      THREE.MathUtils.clamp(side, -1, 1) * WIDEST_PAN,
      gain * fade * fade
    );
  };

  return {
    bed(level) {
      sound.loop("roomBed", BED_GAIN * level);
    },
    close() {
      sound.loop("roomBed", 0);
    },
    flush() {
      if (ownStep !== null) {
        sound.play(ownStep, 0, 1);
      }
      for (let index = 0; index < OTHERS_HEARD; index += 1) {
        const heard = nearest[index];
        if (heard?.cue) {
          playAt(heard.cue, heard.x, heard.z, OTHER_GAIN);
        }
      }
    },
    foot(slot, x, z, steps, pace) {
      if (steps <= 0) {
        return;
      }
      if (slot === ownSlot) {
        ownStep = stepCue(steps, pace);
        return;
      }
      const away = Math.hypot(x - listenerX, z - listenerZ);
      const [first, second] = nearest;
      if (away >= second.away) {
        return;
      }
      let into = second;
      if (away < first.away) {
        copyInto(second, first);
        into = first;
      }
      into.away = away;
      into.cue = stepCue(steps, pace);
      into.x = x;
      into.z = z;
    },
    listen(x, z, camera, own) {
      listenerX = x;
      listenerZ = z;
      ownSlot = own;
      ownStep = null;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      for (const heard of nearest) {
        heard.away = Number.POSITIVE_INFINITY;
        heard.cue = null;
      }
    },
    mine(cue) {
      sound.play(cue, 0, 1);
    },
    near(cue, x, z) {
      playAt(cue, x, z, 1);
    },
  };
};
