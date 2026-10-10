import type { Random } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import { approach, BIKE_HALF_LENGTH, TICK_SECONDS } from "./state.ts";
import type { RaceState, RiderState, TrafficCar } from "./state.ts";

const CLEAR_START_FROM = -70;
const CLEAR_START_TO = 260;
const BRAKING = 7;
const ACCELERATION = 2.5;
const FOLLOW_GAP = 10;
const FOLLOW_SECONDS = 0.9;
const LOOK_AHEAD = 70;
const PAINT_COUNT = 6;

interface Body {
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly height: number;
}

const sedan: Body = { halfLength: 2.2, halfWidth: 0.92, height: 1.45 };
const van: Body = { halfLength: 2.6, halfWidth: 1, height: 2.1 };
const truck: Body = { halfLength: 4.2, halfWidth: 1.2, height: 3.1 };

const pickBody = (roll: number): Body => {
  if (roll < 0.62) {
    return sedan;
  }
  if (roll < 0.86) {
    return van;
  }
  return truck;
};

export const createTraffic = (track: Track, random: Random): TrafficCar[] => {
  const cars: TrafficCar[] = [];
  const span = track.endS - track.startS;
  const perDirection = Math.round(
    (track.plan.trafficPerKilometre * span) / 1000
  );
  const spacing = span / perDirection;
  for (const direction of [1, -1]) {
    for (let index = 0; index < perDirection; index += 1) {
      const s = track.startS + (index + 0.15 + random() * 0.7) * spacing;
      const body = pickBody(random());
      const cruiseSpeed = direction * (19 + random() * 8);
      const blocksStart =
        direction === 1 && s > CLEAR_START_FROM && s < CLEAR_START_TO;
      if (!blocksStart) {
        cars.push({
          ...body,
          cruiseSpeed,
          paint: Math.floor(random() * PAINT_COUNT),
          s,
          speed: cruiseSpeed,
          x: (direction * track.plan.laneWidth) / 2,
        });
      }
    }
  }
  return cars;
};

const gapToRider = (car: TrafficCar, rider: RiderState): number => {
  if (rider.mode === "busted" || (rider.mode === "wrecked" && rider.parked)) {
    return Number.POSITIVE_INFINITY;
  }
  const direction = Math.sign(car.cruiseSpeed);
  const riding = rider.mode === "riding" || rider.mode === "mounting";
  const inLane =
    Math.abs((riding ? rider.x : rider.bodyX) - car.x) < car.halfWidth + 0.9 ||
    Math.abs(rider.x - car.x) < car.halfWidth + 0.9;
  if (!inLane) {
    return Number.POSITIVE_INFINITY;
  }
  const bikeGap = (rider.s - car.s) * direction;
  const bodyGap = (rider.bodyS - car.s) * direction;
  const nearest = Math.min(
    bikeGap > 0 ? bikeGap : Number.POSITIVE_INFINITY,
    bodyGap > 0 ? bodyGap : Number.POSITIVE_INFINITY
  );
  return nearest - car.halfLength - BIKE_HALF_LENGTH;
};

export const stepTraffic = (state: RaceState, track: Track): void => {
  const lastS = state.cars.map((car) => car.s);
  const lastSpeed = state.cars.map((car) => Math.abs(car.speed));
  for (const [index, car] of state.cars.entries()) {
    const direction = Math.sign(car.cruiseSpeed);
    let targetSpeed = Math.abs(car.cruiseSpeed);
    const speed = lastSpeed[index] ?? 0;
    const s = lastS[index] ?? car.s;

    for (const [otherIndex, other] of state.cars.entries()) {
      if (otherIndex !== index && Math.sign(other.cruiseSpeed) === direction) {
        const gap =
          ((lastS[otherIndex] ?? other.s) - s) * direction -
          other.halfLength -
          car.halfLength;
        if (gap > 0 && gap < FOLLOW_GAP + speed * FOLLOW_SECONDS) {
          targetSpeed = Math.min(targetSpeed, lastSpeed[otherIndex] ?? 0);
        }
      }
    }

    for (const rider of state.riders) {
      const gap = gapToRider(car, rider);
      const riderSpeed =
        rider.mode === "riding" ? Math.max(0, rider.speed * direction) : 0;
      if (gap < LOOK_AHEAD && riderSpeed <= speed) {
        const stoppingRoom =
          (speed * speed - riderSpeed * riderSpeed) / (2 * BRAKING) + 8;
        if (gap < stoppingRoom) {
          targetSpeed = Math.min(targetSpeed, riderSpeed);
        }
      }
    }

    const rate = targetSpeed < speed ? BRAKING : ACCELERATION;
    car.speed = direction * approach(speed, targetSpeed, rate * TICK_SECONDS);
    car.s += car.speed * TICK_SECONDS;
    if (car.s > track.endS) {
      car.s = track.startS;
    } else if (car.s < track.startS) {
      car.s = track.endS;
    }
  }
};
