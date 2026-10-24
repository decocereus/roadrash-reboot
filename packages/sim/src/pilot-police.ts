import type { Track } from "@racer/track/track";

import { PLANNED_BRAKING } from "./pilot-corners.ts";
import type { PilotHistory } from "./pilot-history.ts";
import { between, carThreat, chooseLine } from "./pilot-lines.ts";
import type { Aim } from "./pilot-lines.ts";
import { isDown, onBeat, PATROL_SPEED, PULL_OVER } from "./police.ts";
import { BIKE_HALF_WIDTH, clamp, riderOf } from "./state.ts";
import type { RaceState, RiderState } from "./state.ts";

const CATCH_UP_RATE = 0.8;
const ALONGSIDE = 1.5;
const ENGAGE_RANGE = 20;
const BODY_CREEP_SPEED = 3;
const PATROL_END_MARGIN = 80;
const PULL_OVER_CRAWL = 6;

interface Pursuit extends Aim {
  readonly engaged: boolean;
  readonly within: number;
}

const pursuitOf = (
  state: RaceState,
  cop: RiderState,
  target: RiderState
): Pursuit => {
  if (isDown(target)) {
    const within = target.bodyS - cop.s;
    return {
      engaged: true,
      speed: Math.min(
        state.police.topSpeed,
        Math.max(
          BODY_CREEP_SPEED,
          Math.sqrt(2 * PLANNED_BRAKING * Math.max(0, within - 1))
        )
      ),
      within,
      x: target.bodyX,
    };
  }
  const ahead = target.s - cop.s;
  const side = cop.x < target.x ? -1 : 1;
  return {
    engaged: Math.abs(ahead) < ENGAGE_RANGE,
    speed: Math.min(
      state.police.topSpeed,
      target.speed + clamp(ahead * CATCH_UP_RATE, -6, 14)
    ),
    within: Number.POSITIVE_INFINITY,
    x: target.x + side * ALONGSIDE,
  };
};

const carOnTheWay = (
  state: RaceState,
  track: Track,
  cop: RiderState,
  toX: number,
  within: number
): boolean => {
  if (carThreat(state, cop, toX, within)) {
    return true;
  }
  return [...track.sameWayLanes, ...track.oncomingLanes].some(
    (lane) =>
      between(cop.x, toX, lane) &&
      carThreat(state, cop, lane, within) !== undefined
  );
};

export const copAim = (
  history: PilotHistory,
  state: RaceState,
  track: Track,
  cop: RiderState
): Aim => {
  if (cop.parked) {
    return { speed: 0, x: cop.x };
  }
  const target = riderOf(state.riders, cop.chase);
  const offDuty = target === undefined && !onBeat(state, cop);
  if (offDuty || cop.s > track.length - PATROL_END_MARGIN) {
    const offRoad = cop.x > track.roadHalfWidth + BIKE_HALF_WIDTH;
    return {
      speed: offRoad ? 0 : PULL_OVER_CRAWL,
      x: track.roadHalfWidth + PULL_OVER,
    };
  }
  if (!target) {
    return chooseLine(history, state, track, cop, PATROL_SPEED);
  }
  const pursuit = pursuitOf(state, cop, target);
  const open =
    pursuit.engaged &&
    !carOnTheWay(state, track, cop, pursuit.x, pursuit.within);
  return chooseLine(
    history,
    state,
    track,
    cop,
    pursuit.speed,
    open ? pursuit : undefined
  );
};
