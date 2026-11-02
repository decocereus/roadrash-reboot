import type { CrossCarView } from "@racer/sim/race-view";

const TURN_REACH = 5;
const QUARTER = Math.PI / 2;

export interface CrossCarPose {
  s: number;
  x: number;
  yaw: number;
}

export const crossCarPose = (
  car: CrossCarView,
  travel: number,
  pose: CrossCarPose
): void => {
  const crossingYaw = -QUARTER * car.across;
  const turnedYaw = car.along === 1 ? 0 : Math.PI * car.across * -1;
  const cornerX = car.fromX + car.across * car.turnAt;
  const past = travel - car.turnAt;
  if (past <= -TURN_REACH) {
    pose.s = car.laneS;
    pose.x = car.fromX + car.across * travel;
    pose.yaw = crossingYaw;
    return;
  }
  if (past >= TURN_REACH) {
    pose.s = car.laneS + car.along * past;
    pose.x = cornerX;
    pose.yaw = turnedYaw;
    return;
  }
  const share = (past + TURN_REACH) / (2 * TURN_REACH);
  const before = 1 - share;
  pose.s = car.laneS + car.along * TURN_REACH * share * share;
  pose.x = cornerX - car.across * TURN_REACH * before * before;
  pose.yaw = crossingYaw + (turnedYaw - crossingYaw) * share;
};
