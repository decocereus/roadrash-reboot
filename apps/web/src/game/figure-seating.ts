import * as THREE from "three";

import type { BikeFit } from "./bike-fit.ts";
import {
  flinchTurns,
  HANG_SHIFT,
  hangTurns,
  tuckTurns,
} from "./figure-pose.ts";
import type { Planter, Riding, Turn } from "./figure-pose.ts";

const SHARE_STEPS = 6;
const SLIDE_PASSES = 4;
const origin = new THREE.Vector3();
const FOREARM_ROOM = 0.005;

export interface Seating {
  readonly riding: Riding;
  readonly tuckSlide: THREE.Vector3;
}

type Bake = (base: readonly number[], turns: readonly Turn[]) => number[];

const hung = (side: number) => new THREE.Vector3(side * HANG_SHIFT, 0, 0);

const scaled = (turns: readonly Turn[], share: number): Turn[] =>
  turns.map((turn) => ({ ...turn, degrees: turn.degrees * share }));

const largestClear = (clearAt: (share: number) => boolean): number => {
  let clear = 0;
  let sunk = 1;
  for (let step = 0; step < SHARE_STEPS; step += 1) {
    const share = (clear + sunk) / 2;
    if (clearAt(share)) {
      clear = share;
    } else {
      sunk = share;
    }
  }
  return clear;
};

export const seatingOn = (
  fit: BikeFit,
  postured: Riding,
  seated: readonly number[],
  planter: Planter,
  bake: Bake
): Seating => {
  const settled = (
    pose: readonly number[],
    at: THREE.Vector3,
    lie: boolean
  ) => {
    const copy = [...pose];
    planter.settle(copy, at, lie);
    return copy;
  };
  const slide = fit.posture.tuckSlide.clone();
  const tuckedHangs = [-1, 1].map(
    (side) => [bake(postured.tucked, hangTurns(side)), hung(side)] as const
  );
  for (let pass = 0; pass < SLIDE_PASSES; pass += 1) {
    const short = Math.max(
      planter.reachShortOf(postured.tucked, slide),
      ...tuckedHangs.map(([pose, shift]) =>
        planter.reachShortOf(pose, shift.clone().add(slide))
      )
    );
    if (short <= 0 || slide.z <= 0) {
      break;
    }
    slide.multiplyScalar(Math.max(0, 1 - short / slide.z));
  }
  const hangingFrom = (
    from: readonly number[],
    side: number,
    base: THREE.Vector3
  ) => {
    const at = hung(side).add(base);
    const hangBy = (share: number) =>
      bake(from, scaled(hangTurns(side), share));
    const clearAt = (pose: readonly number[]) =>
      planter.sinkOf(pose, at, "chest") <= 0 &&
      planter.sinkOf(pose, at, "forearms") <= -FOREARM_ROOM;
    const whole = hangBy(1);
    if (clearAt(whole)) {
      return whole;
    }
    const share = largestClear((part) => clearAt(hangBy(part)));
    return settled(hangBy(share), at, false);
  };
  const rest = settled(postured.seated, origin, false);
  const fullTuck = settled(postured.tucked, slide, true);
  const tuckedWith = (elbowsIn: number) =>
    settled(bake(seated, tuckTurns(fit.posture, elbowsIn)), slide, true);
  const tucked =
    planter.sinkOf(fullTuck, slide, "forearms") <= -FOREARM_ROOM
      ? fullTuck
      : tuckedWith(
          largestClear(
            (elbowsIn) =>
              planter.sinkOf(tuckedWith(elbowsIn), slide, "forearms") <=
              -FOREARM_ROOM
          )
        );
  return {
    riding: {
      flinch: {
        left: bake(rest, flinchTurns(-1)),
        right: bake(rest, flinchTurns(1)),
      },
      hang: {
        left: hangingFrom(rest, -1, origin),
        right: hangingFrom(rest, 1, origin),
      },
      kicked: postured.kicked,
      risen: postured.risen,
      seated: rest,
      tucked,
      tuckedHang: {
        left: hangingFrom(tucked, -1, slide),
        right: hangingFrom(tucked, 1, slide),
      },
    },
    tuckSlide: slide,
  };
};
