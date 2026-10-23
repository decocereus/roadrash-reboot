import type { RaceState } from "./state.ts";

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
  riderIndex: number,
  s: number
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  rider.bodyS += s - rider.s;
  rider.s = s;
};

export const placeRiderAcross = (
  state: RaceState,
  riderIndex: number,
  x: number
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  rider.x = x;
  rider.bodyX = x;
};

export const setRiderSpeed = (
  state: RaceState,
  riderIndex: number,
  speed: number
): void => {
  const rider = state.riders[riderIndex];
  if (rider) {
    rider.speed = speed;
  }
};
