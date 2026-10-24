import { riderOf } from "./state.ts";
import type { RaceState, RiderId } from "./state.ts";

const CLEAR_BEHIND = 60;
const CLEAR_AHEAD = 400;
const CLEAR_TO = 700;
const CLEAR_GAP = 35;

export const relocateTraffic = (
  state: RaceState,
  from: number,
  to: number
): void => {
  let moved = 0;
  for (const car of state.cars) {
    if (car.s > from - CLEAR_BEHIND && car.s < to + CLEAR_AHEAD) {
      car.s = to + CLEAR_TO + moved * CLEAR_GAP;
      moved += 1;
    }
  }
};

export const placeRiderAt = (
  state: RaceState,
  id: RiderId,
  s: number
): void => {
  const rider = riderOf(state.riders, id);
  if (!rider) {
    return;
  }
  rider.bodyS += s - rider.s;
  rider.s = s;
};

export const placeRiderAcross = (
  state: RaceState,
  id: RiderId,
  x: number
): void => {
  const rider = riderOf(state.riders, id);
  if (!rider) {
    return;
  }
  rider.x = x;
  rider.bodyX = x;
};

export const setRiderSpeed = (
  state: RaceState,
  id: RiderId,
  speed: number
): void => {
  const rider = riderOf(state.riders, id);
  if (rider) {
    rider.speed = speed;
  }
};
