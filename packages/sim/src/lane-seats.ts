import { trafficReachAt } from "@racer/track/districts";
import type { Track } from "@racer/track/track";

import type { TrafficCar } from "./state.ts";

export const narrows = (track: Track): boolean =>
  track.plan.districts.length > 1;

export const seatOf = (home: number, track: Track, s: number): number =>
  Math.sign(home) * Math.min(Math.abs(home), trafficReachAt(track, s));

export const seatCar = (car: TrafficCar, track: Track): void => {
  car.x = seatOf(car.home, track, car.s);
};

export const carSlant = (
  { halfLength, home }: Pick<TrafficCar, "halfLength" | "home">,
  track: Track,
  s: number
): number =>
  (seatOf(home, track, s + halfLength) - seatOf(home, track, s - halfLength)) /
  (2 * halfLength);

export const seatCars = (cars: readonly TrafficCar[], track: Track): void => {
  if (narrows(track)) {
    for (const car of cars) {
      seatCar(car, track);
    }
  }
};
