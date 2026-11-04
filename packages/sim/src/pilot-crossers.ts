import { roadHalfWidthAt } from "@racer/track/districts";
import { nextSeed, unitOf } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import { onRoad } from "./cross-traffic.ts";
import { BIKE_HALF_LENGTH, BIKE_HALF_WIDTH } from "./state.ts";
import type { CrossCar, Pedestrian, RaceState, RiderState } from "./state.ts";

const HAZARD_SIGHT_SECONDS = 2.35;
const HAZARD_SIGHT_EXTRA = 15;
export const HAZARD_MISS_SHARE = 0.4;
const WALKER_NEAR_LINE = 1.7;

interface Crosser {
  readonly s: number;
  readonly x: number;
  readonly drift: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}

export const sightOf = (rider: RiderState): number =>
  rider.speed * HAZARD_SIGHT_SECONDS + HAZARD_SIGHT_EXTRA;

export const metresToCrosser = (rider: RiderState, crosser: Crosser): number =>
  crosser.s - crosser.halfLength - BIKE_HALF_LENGTH - rider.s;

export const crosserAtArrival = (rider: RiderState, crosser: Crosser): number =>
  crosser.x +
  (crosser.drift * Math.max(0, metresToCrosser(rider, crosser))) /
    Math.max(1, rider.speed);

export const crosserReach = (crosser: Crosser): number =>
  crosser.halfWidth + BIKE_HALF_WIDTH;

const crosserAhead = (
  track: Track,
  rider: RiderState,
  crosser: Crosser
): boolean =>
  metresToCrosser(rider, crosser) <= sightOf(rider) &&
  crosser.s + crosser.halfLength + BIKE_HALF_LENGTH >= rider.s &&
  Math.abs(crosserAtArrival(rider, crosser)) <
    roadHalfWidthAt(track, crosser.s) + crosserReach(crosser);

export const crossCarInSight = (
  track: Track,
  rider: RiderState,
  car: CrossCar
): boolean => onRoad(car) && crosserAhead(track, rider, car);

const overlooks = (rider: RiderState, pedestrian: Pedestrian): boolean =>
  unitOf(nextSeed(pedestrian.dice + rider.id)) <
  (1 - rider.profile.skill) * HAZARD_MISS_SHARE;

export const walkerInSight = (
  track: Track,
  rider: RiderState,
  pedestrian: Pedestrian
): boolean =>
  pedestrian.mode === "walking" &&
  crosserAhead(track, rider, pedestrian) &&
  Math.abs(crosserAtArrival(rider, pedestrian) - rider.x) < WALKER_NEAR_LINE &&
  !overlooks(rider, pedestrian);

export const seesCrosser = (
  state: RaceState,
  track: Track,
  rider: RiderState
): boolean => {
  const { crossCars, pedestrians } = state;
  const crossCount = crossCars.length;
  const walkerCount = pedestrians.length;
  for (let index = 0; index < crossCount; index += 1) {
    const car = crossCars[index];
    if (car && crossCarInSight(track, rider, car)) {
      return true;
    }
  }
  for (let index = 0; index < walkerCount; index += 1) {
    const pedestrian = pedestrians[index];
    if (pedestrian && walkerInSight(track, rider, pedestrian)) {
      return true;
    }
  }
  return false;
};
