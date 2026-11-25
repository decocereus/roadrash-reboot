import * as THREE from "three";

import type { BikeDeck } from "./bike-deck.ts";
import type { BikeFit } from "./bike-fit.ts";
import type { BikePosture } from "./bike-posture.ts";
import {
  flinchTurns,
  HANG_SHIFT,
  hangTurns,
  KNEE_FULL_SPEED,
  kneeOut,
  restTurns,
  tuckTurns,
} from "./figure-pose.ts";
import type { Planter, Riding, Sided, Turn } from "./figure-pose.ts";

const SHARE_STEPS = 6;
const SLIDE_PASSES = 4;
const origin = new THREE.Vector3();
const FOREARM_ROOM = 0.005;
const REACH_ROOM = 0.012;
const QUATERNION = 4;

export const SEAT_CHECK_SPEED = KNEE_FULL_SPEED;

const SEAT_LEANS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1] as const;
const SEAT_TUCKS = [0, 0.25, 0.5, 0.75, 1] as const;

export const seatGrid = SEAT_LEANS.flatMap((lean) =>
  SEAT_TUCKS.map((tuck) => ({ lean, tuck }))
);

type SeatCheck = (typeof seatGrid)[number];

const solvedAt = ({ lean, tuck }: SeatCheck) =>
  lean === 0 || (Math.abs(lean) === 1 && (tuck === 0 || tuck === 1));

const seatFitChecks = seatGrid.filter(solvedAt);

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

type Turned = readonly number[];

interface Hung {
  readonly share: number;
  readonly spine: Turned;
}

export interface SeatFit {
  readonly rest: Turned;
  readonly elbowsIn: number;
  readonly tuck: Turned;
  readonly hang: Sided<Hung>;
  readonly tuckedHang: Sided<Hung>;
  readonly slide: readonly number[];
}

export interface Seating {
  readonly riding: Riding;
  readonly tuckSlide: THREE.Vector3;
}

type Bake = (base: readonly number[], turns: readonly Turn[]) => number[];

export interface Seated {
  readonly seated: readonly number[];
  readonly kicked: Sided<number[]>;
  readonly risen: Sided<number[]>;
  readonly spine: number;
  readonly bake: Bake;
}

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

const spineOf = (pose: readonly number[], spine: number): Turned =>
  pose.slice(spine * QUATERNION, (spine + 1) * QUATERNION);

const withSpine = (pose: number[], spine: number, turned: Turned) => {
  pose.splice(spine * QUATERNION, QUATERNION, ...turned);
  return pose;
};

export const postureFit = (
  posture: BikePosture,
  { bake, seated, spine }: Seated
): SeatFit => {
  const rest = bake(seated, restTurns(posture));
  const tucked = bake(seated, tuckTurns(posture));
  const hangOf = (from: readonly number[], side: number): Hung => ({
    share: 1,
    spine: spineOf(bake(from, hangTurns(side)), spine),
  });
  return {
    elbowsIn: 1,
    hang: { left: hangOf(rest, -1), right: hangOf(rest, 1) },
    rest: spineOf(rest, spine),
    slide: [posture.tuckSlide.x, posture.tuckSlide.y, posture.tuckSlide.z],
    tuck: spineOf(tucked, spine),
    tuckedHang: { left: hangOf(tucked, -1), right: hangOf(tucked, 1) },
  };
};

export const seatingFrom = (
  fit: SeatFit,
  posture: BikePosture,
  { bake, kicked, risen, seated, spine }: Seated
): Seating => {
  const rest = withSpine(bake(seated, restTurns(posture)), spine, fit.rest);
  const tucked = withSpine(
    bake(seated, tuckTurns(posture, fit.elbowsIn)),
    spine,
    fit.tuck
  );
  const hangFrom = (from: readonly number[], side: number, hang: Hung) =>
    withSpine(
      bake(from, scaled(hangTurns(side), hang.share)),
      spine,
      hang.spine
    );
  return {
    riding: {
      flinch: {
        left: bake(rest, flinchTurns(-1)),
        right: bake(rest, flinchTurns(1)),
      },
      hang: {
        left: hangFrom(rest, -1, fit.hang.left),
        right: hangFrom(rest, 1, fit.hang.right),
      },
      kicked,
      risen,
      seated: rest,
      tucked,
      tuckedHang: {
        left: hangFrom(tucked, -1, fit.tuckedHang.left),
        right: hangFrom(tucked, 1, fit.tuckedHang.right),
      },
    },
    tuckSlide: new THREE.Vector3().fromArray(fit.slide),
  };
};

export const seatFitOn = (
  fit: BikeFit,
  deck: BikeDeck,
  planter: Planter,
  { bake, seated, spine }: Seated
): SeatFit => {
  const { posture } = fit;
  const settled = (
    pose: readonly number[],
    at: THREE.Vector3,
    lie: boolean
  ) => {
    const copy = [...pose];
    planter.settle(copy, at, lie, deck);
    return copy;
  };
  const restPose = bake(seated, restTurns(posture));
  const tuckPose = bake(seated, tuckTurns(posture));
  const slide = posture.tuckSlide.clone();
  const tuckedHangs = [-1, 1].map(
    (side) => [bake(tuckPose, hangTurns(side)), hung(side)] as const
  );
  for (let pass = 0; pass < SLIDE_PASSES; pass += 1) {
    const short =
      Math.max(
        planter.reachShortOf(tuckPose, slide),
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
    return planter.sinkOf(planted, lift, "forearms", deck) <= -FOREARM_ROOM;
  };
  const clearIn = (pose: readonly number[], check: SeatCheck) => {
    const { lift, planted } = plantedIn(pose, check);
    return (
      planter.reachShortOf(planted, lift) <= 0 &&
      planter.sinkOf(planted, lift, "chest", deck) <= 0 &&
      planter.sinkOf(planted, lift, "forearms", deck) <= -FOREARM_ROOM
    );
  };
  const hangingFrom = (
    from: readonly number[],
    side: number,
    tuck: 0 | 1
  ): Hung => {
    const at = hung(side).addScaledVector(slide, tuck);
    const checks = seatFitChecks.filter(
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
      return { share: 1, spine: spineOf(whole, spine) };
    }
    const share = largestClear((part) => clearAt(hangBy(part)));
    return { share, spine: spineOf(settled(hangBy(share), at, false), spine) };
  };
  const rest = settled(restPose, origin, false);
  const tuckedWith = (elbowsIn: number) =>
    settled(bake(seated, tuckTurns(posture, elbowsIn)), slide, true);
  const tuckChecks = seatFitChecks.filter(
    (check) => check.lean === 0 && check.tuck > 0
  );
  const clearOf = (pose: readonly number[]) =>
    tuckChecks.every((check) =>
      armsClearIn(blended(rest, pose, check.tuck), check)
    );
  const fullTuck = settled(tuckPose, slide, true);
  const elbowsIn = clearOf(fullTuck)
    ? 1
    : largestClear((share) => clearOf(tuckedWith(share)));
  const tucked = elbowsIn === 1 ? fullTuck : tuckedWith(elbowsIn);
  return {
    elbowsIn,
    hang: {
      left: hangingFrom(rest, -1, 0),
      right: hangingFrom(rest, 1, 0),
    },
    rest: spineOf(rest, spine),
    slide: [slide.x, slide.y, slide.z],
    tuck: spineOf(tucked, spine),
    tuckedHang: {
      left: hangingFrom(tucked, -1, 1),
      right: hangingFrom(tucked, 1, 1),
    },
  };
};
