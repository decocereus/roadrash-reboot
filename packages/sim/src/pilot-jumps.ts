import { lipOf, nextJumpFrom } from "@racer/track/features";
import type { TrackFeature } from "@racer/track/features";
import { slopeRateAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import {
  JUMP_LANDING_ROOM,
  JUMP_WALL_CLEARANCE,
  safeLaunchSpeed,
} from "./pilot-corners.ts";
import type { Aim } from "./pilot-lines.ts";
import { BIKE_HALF_WIDTH, GRAVITY } from "./state.ts";
import type { RaceState, RiderState } from "./state.ts";

const JUMP_SIGHT_SECONDS = 3.5;
const JUMP_SIGHT_EXTRA = 10;
const JUMP_PULL = 3.6;
const JUMP_ALIGN_SECONDS = 0.5;
const JUMP_ALIGN_PER_METRE = 0.45;
const JUMP_LINE_SPREAD = 1.2;
const MISREAD_SHARE = 0.8;
const MISREAD_EDGE = 0.15;
const MISREAD_REACH = 1.5;
const MISREAD_SLACK = 0.1;
const MISREAD_DIVE = 5;
const STRAIGHTEN_SECONDS = 0.6;
const STRAIGHTEN_SCAN_STEP = 2;

const misreads = (
  state: RaceState,
  rider: RiderState,
  jumpIndex: number,
  roll: (state: RaceState) => number
): boolean => {
  if (rider.jumpSeen !== jumpIndex) {
    rider.jumpSeen = jumpIndex;
    rider.jumpMisread = roll(state) < (1 - rider.profile.skill) * MISREAD_SHARE;
  }
  return rider.jumpMisread;
};

const roadSide = (
  track: Track,
  jump: TrackFeature,
  side: number,
  reach: number
): number =>
  Math.abs(jump.x + side * reach) > track.roadHalfWidth - BIKE_HALF_WIDTH
    ? -side
    : side;

const lineOnto = (
  track: Track,
  jump: TrackFeature,
  rider: RiderState,
  misread: boolean
): number => {
  const side = rider.id % 2 === 0 ? 1 : -1;
  if (misread) {
    const across = rider.x - jump.x;
    const gap = Math.abs(across) - jump.width / 2;
    const toLip = (lipOf(jump) - rider.s) / Math.max(1, rider.speed);
    const dives =
      gap > 0 &&
      gap < MISREAD_REACH &&
      toLip < Math.sqrt((2 * gap) / rider.bike.steerRate) + MISREAD_SLACK;
    return dives
      ? jump.x - Math.sign(across) * MISREAD_DIVE
      : jump.x +
          roadSide(track, jump, side, jump.width / 2 + MISREAD_EDGE) *
            (jump.width / 2 + MISREAD_EDGE);
  }
  const spread = (1 - rider.profile.skill) * JUMP_LINE_SPREAD;
  return jump.x + side * Math.min(spread, jump.width / 2 - BIKE_HALF_WIDTH);
};

const clearOfWall = (
  track: Track,
  jump: TrackFeature,
  rider: RiderState,
  aim: Aim
): Aim => {
  const wall = jump.width / 2 + JUMP_WALL_CLEARANCE;
  if (Math.abs(aim.x - jump.x) >= wall) {
    return aim;
  }
  const side = roadSide(track, jump, Math.sign(rider.x - jump.x) || 1, wall);
  return { speed: aim.speed, x: jump.x + side * wall };
};

export const jumpAim = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  aim: Aim,
  roll: (state: RaceState) => number
): Aim => {
  const jumpIndex = nextJumpFrom(track, rider.s);
  const jump = track.features[jumpIndex];
  if (!jump) {
    return aim;
  }
  const toToe = jump.s - rider.s;
  const offset = Math.abs(rider.x - jump.x);
  if (toToe <= 0) {
    if (offset <= jump.width / 2) {
      return { speed: aim.speed, x: jump.x };
    }
    return rider.jumpSeen === jumpIndex && rider.jumpMisread
      ? { speed: aim.speed, x: lineOnto(track, jump, rider, true) }
      : clearOfWall(track, jump, rider, aim);
  }
  if (toToe > rider.speed * JUMP_SIGHT_SECONDS + JUMP_SIGHT_EXTRA) {
    return aim;
  }
  const drawn =
    Math.abs(aim.x - jump.x) < JUMP_PULL ||
    offset < jump.width / 2 + BIKE_HALF_WIDTH;
  if (!drawn) {
    return aim;
  }
  const lined = offset <= jump.width / 2 - BIKE_HALF_WIDTH;
  const committed = rider.jumpSeen === jumpIndex && rider.jumpMisread;
  const reachable =
    lined ||
    committed ||
    toToe / Math.max(1, rider.speed) >
      JUMP_ALIGN_SECONDS + JUMP_ALIGN_PER_METRE * offset;
  const landsOnRoad =
    Math.abs(jump.x) < track.roadHalfWidth - JUMP_LANDING_ROOM;
  if (reachable && landsOnRoad) {
    return {
      speed: Math.min(aim.speed, safeLaunchSpeed(jump)),
      x: lineOnto(track, jump, rider, misreads(state, rider, jumpIndex, roll)),
    };
  }
  return clearOfWall(track, jump, rider, aim);
};

const launchesSoon = (track: Track, rider: RiderState): boolean => {
  const reach = rider.speed * STRAIGHTEN_SECONDS;
  const lift = -GRAVITY / (rider.speed * rider.speed);
  for (let ahead = 0; ahead <= reach; ahead += STRAIGHTEN_SCAN_STEP) {
    if (slopeRateAt(track, rider.s + ahead) < lift) {
      return true;
    }
  }
  return false;
};

export const straightened = (
  track: Track,
  rider: RiderState,
  aim: Aim
): Aim => {
  if (rider.speed <= 0 || !launchesSoon(track, rider)) {
    return aim;
  }
  const settling =
    (rider.lateralSpeed * Math.abs(rider.lateralSpeed)) /
    (2 * rider.bike.steerRate);
  return { speed: aim.speed, x: rider.x + settling };
};
