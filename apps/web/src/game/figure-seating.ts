import * as THREE from "three";

import type { BikeFit } from "./bike-fit.ts";
import {
  flinchTurns,
  HANG_SHIFT,
  hangTurns,
  KNEE_FULL_SPEED,
  kneeOut,
  tuckTurns,
} from "./figure-pose.ts";
import type { Planter, Riding, Turn } from "./figure-pose.ts";

const SHARE_STEPS = 6;
const SLIDE_PASSES = 4;
const origin = new THREE.Vector3();
const FOREARM_ROOM = 0.005;
const REACH_ROOM = 0.012;
const QUATERNION = 4;

export const SEAT_CHECK_SPEED = KNEE_FULL_SPEED;

export const seatChecks = [
  { lean: 0, name: "rest", tuck: 0 },
  { lean: 0, name: "a quarter tuck", tuck: 0.25 },
  { lean: 0, name: "half a tuck", tuck: 0.5 },
  { lean: 0, name: "three quarters of a tuck", tuck: 0.75 },
  { lean: 0, name: "tuck", tuck: 1 },
  { lean: -1, name: "lean left", tuck: 0 },
  { lean: 1, name: "lean right", tuck: 0 },
  { lean: -1, name: "tucked lean left", tuck: 1 },
  { lean: 1, name: "tucked lean right", tuck: 1 },
] as const;

type SeatCheck = (typeof seatChecks)[number];

const blended = (
  from: readonly number[],
  to: readonly number[],
  share: number
): number[] => {
  const pose = [...from];
  const target = [...to];
  for (let at = 0; at < pose.length; at += QUATERNION) {
    THREE.Quaternion.slerpFlat(pose, at, pose, at, target, at, share);
  }
  return pose;
};

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
    const short =
      Math.max(
        planter.reachShortOf(postured.tucked, slide),
        ...tuckedHangs.map(([pose, shift]) =>
          planter.reachShortOf(pose, shift.clone().add(slide))
        )
      ) + REACH_ROOM;
    if (short <= 0 || slide.z <= 0) {
      break;
    }
    slide.multiplyScalar(Math.max(0, 1 - short / slide.z));
  }
  const liftIn = ({ lean, tuck }: SeatCheck) =>
    new THREE.Vector3(
      Math.sign(lean) * HANG_SHIFT * kneeOut(lean, SEAT_CHECK_SPEED),
      0,
      0
    ).addScaledVector(slide, tuck);
  const plantedIn = (pose: readonly number[], check: SeatCheck) => {
    const planted = [...pose];
    const lift = liftIn(check);
    planter.plant(planted, lift, "seated", 1, check.lean, SEAT_CHECK_SPEED);
    return { lift, planted };
  };
  const armsClearIn = (pose: readonly number[], check: SeatCheck) => {
    const { lift, planted } = plantedIn(pose, check);
    return planter.sinkOf(planted, lift, "forearms") <= -FOREARM_ROOM;
  };
  const clearIn = (pose: readonly number[], check: SeatCheck) => {
    const { lift, planted } = plantedIn(pose, check);
    return (
      planter.reachShortOf(planted, lift) <= 0 &&
      planter.sinkOf(planted, lift, "chest") <= 0 &&
      planter.sinkOf(planted, lift, "forearms") <= -FOREARM_ROOM
    );
  };
  const hangingFrom = (from: readonly number[], side: number, tuck: 0 | 1) => {
    const at = hung(side).addScaledVector(slide, tuck);
    const checks = seatChecks.filter(
      (check) => check.tuck === tuck && Math.sign(check.lean) === side
    );
    const hangBy = (share: number) =>
      bake(from, scaled(hangTurns(side), share));
    const clearAt = (pose: readonly number[]) =>
      checks.every((check) =>
        clearIn(blended(from, pose, Math.abs(check.lean)), check)
      );
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
  const tuckChecks = seatChecks.filter(
    (check) => check.lean === 0 && check.tuck > 0
  );
  const clearOf = (pose: readonly number[]) =>
    tuckChecks.every((check) =>
      armsClearIn(blended(rest, pose, check.tuck), check)
    );
  const tucked = clearOf(fullTuck)
    ? fullTuck
    : tuckedWith(largestClear((elbowsIn) => clearOf(tuckedWith(elbowsIn))));
  return {
    riding: {
      flinch: {
        left: bake(rest, flinchTurns(-1)),
        right: bake(rest, flinchTurns(1)),
      },
      hang: {
        left: hangingFrom(rest, -1, 0),
        right: hangingFrom(rest, 1, 0),
      },
      kicked: postured.kicked,
      risen: postured.risen,
      seated: rest,
      tucked,
      tuckedHang: {
        left: hangingFrom(tucked, -1, 1),
        right: hangingFrom(tucked, 1, 1),
      },
    },
    tuckSlide: slide,
  };
};
