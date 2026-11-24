import * as THREE from "three";

import type { Gait, Stride } from "./gait.ts";
import { MOVE_RATE } from "./rider-moves.ts";

export const MOVING_PACE = 0.1;
const FADE_SECONDS = 0.25;
const SETTLE_PHASES = [0.25, 0.75] as const;

export interface Footing {
  readonly pose: number[];
  readonly lift: THREE.Vector3;
  readonly planted: boolean[];
}

export interface Strider extends Footing {
  readonly phase: () => number;
  readonly step: (pace: number, seconds: number) => void;
}

interface Pair {
  from: Stride;
  to: Stride;
  share: number;
}

const firstHalf = ({ left, right, seconds }: Stride): number =>
  right > left ? right - left : right + seconds - left;

const clipTime = (stride: Stride, phase: number): number => {
  const half = firstHalf(stride);
  const into =
    phase < 0.5
      ? 2 * phase * half
      : half + (2 * phase - 1) * (stride.seconds - half);
  return (stride.left + into) % stride.seconds;
};

const phaseRate = (stride: Stride, phase: number, pace: number): number => {
  const half = firstHalf(stride);
  const span = phase < 0.5 ? half : stride.seconds - half;
  return pace / stride.speed / (2 * span);
};

const sampled = (
  stride: Stride,
  time: number,
  pose: number[],
  lift: THREE.Vector3
) => {
  const frame = time * MOVE_RATE;
  const whole = Math.floor(frame);
  const share = frame - whole;
  const from = whole % stride.frames;
  const to = (from + 1) % stride.frames;
  const count = pose.length;
  for (let offset = 0; offset < count; offset += 4) {
    THREE.Quaternion.slerpFlat(
      pose,
      offset,
      stride.poses,
      from * count + offset,
      stride.poses,
      to * count + offset,
      share
    );
  }
  const { lifts } = stride;
  lift.set(
    THREE.MathUtils.lerp(lifts[from * 3] ?? 0, lifts[to * 3] ?? 0, share),
    THREE.MathUtils.lerp(
      lifts[from * 3 + 1] ?? 0,
      lifts[to * 3 + 1] ?? 0,
      share
    ),
    THREE.MathUtils.lerp(
      lifts[from * 3 + 2] ?? 0,
      lifts[to * 3 + 2] ?? 0,
      share
    )
  );
};

const mixInto = (
  into: number[],
  from: number[],
  to: number[],
  share: number
) => {
  for (let offset = 0; offset < into.length; offset += 4) {
    THREE.Quaternion.slerpFlat(into, offset, from, offset, to, offset, share);
  }
};

const crossed = (before: number, after: number, mark: number): boolean =>
  after >= before
    ? before < mark && mark <= after
    : before < mark || mark <= after;

export const createStrider = (gait: Gait, bones: number): Strider => {
  const { idle, jog, sprint, walk } = gait;
  const pose = Array.from({ length: bones * 4 }, () => 0);
  const other = [...pose];
  const resting = [...pose];
  const lift = new THREE.Vector3();
  const planted = [true, true];
  const otherLift = new THREE.Vector3();
  const restingLift = new THREE.Vector3();
  const ladder = [walk, jog, sprint] as const;
  const pair: Pair = { from: walk, share: 0, to: walk };
  let phase: number = SETTLE_PHASES[0];
  let idleTime = 0;
  let still = 1;
  let settled = true;
  let pace = walk.speed;

  const pairAt = (speed: number) => {
    pair.from = sprint;
    pair.to = sprint;
    pair.share = 0;
    for (let rung = 0; rung < ladder.length; rung += 1) {
      const low = ladder[rung];
      const high = ladder[rung + 1];
      if (low && speed <= low.speed) {
        pair.from = low;
        pair.to = low;
        return;
      }
      if (low && high && speed <= high.speed) {
        pair.from = low;
        pair.to = high;
        pair.share = (speed - low.speed) / (high.speed - low.speed);
        return;
      }
    }
  };

  const advance = (seconds: number): number => {
    pairAt(pace);
    const rate = THREE.MathUtils.lerp(
      phaseRate(pair.from, phase, pace),
      phaseRate(pair.to, phase, pace),
      pair.share
    );
    const before = phase;
    phase = (phase + rate * seconds) % 1;
    for (const mark of SETTLE_PHASES) {
      if (crossed(before, phase, mark)) {
        return mark;
      }
    }
    return -1;
  };

  return {
    lift,
    phase: () => phase,
    planted,
    pose,
    step(speed, seconds) {
      idleTime = (idleTime + seconds) % idle.seconds;
      if (speed > MOVING_PACE) {
        settled = false;
        pace = speed;
        still = Math.max(0, still - seconds / FADE_SECONDS);
        advance(seconds);
      } else if (settled) {
        still = Math.min(1, still + seconds / FADE_SECONDS);
      } else {
        pace = Math.max(pace, walk.speed);
        const mark = advance(seconds);
        if (mark !== -1) {
          settled = true;
          phase = mark;
        }
      }
      sampled(pair.from, clipTime(pair.from, phase), pose, lift);
      if (pair.share > 0) {
        sampled(pair.to, clipTime(pair.to, phase), other, otherLift);
        mixInto(pose, pose, other, pair.share);
        lift.lerp(otherLift, pair.share);
      }
      if (still > 0) {
        const eased = still * still * (3 - 2 * still);
        sampled(idle, idleTime, resting, restingLift);
        mixInto(pose, pose, resting, eased);
        lift.lerp(restingLift, eased);
      }
      const leading = pair.share < 0.5 ? pair.from : pair.to;
      const moving = still < 0.5;
      const shown = moving ? leading : idle;
      const time = moving ? clipTime(leading, phase) : idleTime;
      const frame = Math.round(time * MOVE_RATE) % shown.frames;
      planted[0] = shown.planted[frame * 2] ?? true;
      planted[1] = shown.planted[frame * 2 + 1] ?? true;
    },
  };
};
