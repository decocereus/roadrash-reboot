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

interface Lane {
  readonly direction: number;
  readonly order: readonly number[];
  readonly longest: number;
}

const laneOf = (
  cars: readonly TrafficCar[],
  lastS: readonly number[],
  direction: number
): Lane => {
  const order: number[] = [];
  let longest = 0;
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (car && Math.sign(car.cruiseSpeed) === direction) {
      order.push(index);
      longest = Math.max(longest, car.halfLength);
    }
  }
  order.sort(
    (left, right) => ((lastS[left] ?? 0) - (lastS[right] ?? 0)) * direction
  );
  return { direction, longest, order };
};

const followLane = (
  cars: readonly TrafficCar[],
  lastS: readonly number[],
  lastSpeed: readonly number[],
  lane: Lane,
  followed: number[]
): void => {
  const { direction, longest, order } = lane;
  for (let place = 0; place < order.length; place += 1) {
    const index = order[place] ?? -1;
    const car = cars[index];
    if (!car) {
      continue;
    }
    const s = lastS[index] ?? car.s;
    const reach = FOLLOW_GAP + (lastSpeed[index] ?? 0) * FOLLOW_SECONDS;
    let targetSpeed = Math.abs(car.cruiseSpeed);
    for (let ahead = place + 1; ahead < order.length; ahead += 1) {
      const otherIndex = order[ahead] ?? -1;
      const other = cars[otherIndex];
      if (!other) {
        continue;
      }
      const apart = ((lastS[otherIndex] ?? other.s) - s) * direction;
      if (apart - longest - car.halfLength >= reach) {
        break;
      }
      const gap = apart - other.halfLength - car.halfLength;
      if (gap > 0 && gap < reach) {
        targetSpeed = Math.min(targetSpeed, lastSpeed[otherIndex] ?? 0);
      }
    }
    followed[index] = targetSpeed;
  }
};

export const stepTraffic = (state: RaceState, track: Track): void => {
  const { cars, riders } = state;
  const lastS = cars.map((car) => car.s);
  const lastSpeed = cars.map((car) => Math.abs(car.speed));
  const followed = cars.map((car) => Math.abs(car.cruiseSpeed));
  for (const direction of [1, -1]) {
    followLane(
      cars,
      lastS,
      lastSpeed,
      laneOf(cars, lastS, direction),
      followed
    );
  }
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (!car) {
      continue;
    }
    const direction = Math.sign(car.cruiseSpeed);
    const speed = lastSpeed[index] ?? 0;
    let targetSpeed = followed[index] ?? Math.abs(car.cruiseSpeed);

    const sight = LOOK_AHEAD + car.halfLength + BIKE_HALF_LENGTH;
    for (const rider of riders) {
      const bikeAhead = (rider.s - car.s) * direction;
      const bodyAhead = (rider.bodyS - car.s) * direction;
      if (
        (bikeAhead <= 0 || bikeAhead >= sight) &&
        (bodyAhead <= 0 || bodyAhead >= sight)
      ) {
        continue;
      }
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
