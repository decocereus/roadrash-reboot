import type { PoseName } from "./assets.ts";
import type { RiderPose } from "./figure-pose.ts";

const RUN_HZ = 2.6;
const TUMBLE_HZ = 1.75;
const FULL_TURN = Math.PI * 2;

export const striking = (pose: RiderPose): boolean =>
  pose === "punch" ||
  pose === "kick" ||
  pose === "windup" ||
  pose === "swing" ||
  pose === "swung";

const sidedName = (left: PoseName, right: PoseName, side: number): PoseName =>
  side < 0 ? left : right;

export const strikeName = (pose: RiderPose, side: number): PoseName => {
  if (pose === "punch") {
    return sidedName("punch_l", "punch_r", side);
  }
  if (pose === "windup") {
    return sidedName("windup_l", "windup_r", side);
  }
  return sidedName("swing_l", "swing_r", side);
};

export interface Cycle {
  from: PoseName;
  to: PoseName;
  blend: number;
}

export const cycleFor = (pose: RiderPose, time: number, cycle: Cycle): void => {
  if (pose === "run" || pose === "stand") {
    cycle.from = "run_a";
    cycle.to = "run_b";
    cycle.blend =
      pose === "run" ? 0.5 - 0.5 * Math.cos(time * RUN_HZ * FULL_TURN) : 0.5;
  } else if (pose === "tumble") {
    cycle.from = "tumble_a";
    cycle.to = "tumble_b";
    cycle.blend = 0.5 + 0.5 * Math.sin(time * TUMBLE_HZ * FULL_TURN);
  } else {
    const held = pose === "lift" || pose === "lying" ? pose : "surrender";
    cycle.from = held;
    cycle.to = held;
    cycle.blend = 0;
  }
};
