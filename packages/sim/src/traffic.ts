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
const SLOW_CRUISE = 23;
const FAVOURED_LANE_SHARE = 0.8;

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

const laneFor = (
  lanes: readonly number[],
  cruiseSpeed: number,
  random: Random
): number => {
  const inner = lanes[0] ?? 0;
  const outer = lanes.at(-1) ?? inner;
  if (lanes.length === 1) {
    return inner;
  }
  const favoured = Math.abs(cruiseSpeed) < SLOW_CRUISE ? outer : inner;
  const other = favoured === outer ? inner : outer;
  return random() < FAVOURED_LANE_SHARE ? favoured : other;
};

export const createTraffic = (track: Track, random: Random): TrafficCar[] => {
  const cars: TrafficCar[] = [];
  const span = track.endS - track.startS;
  const perDirection = Math.round(
    (track.plan.trafficPerKilometre * span) / 1000
  );
  const spacing = span / perDirection;
  for (const direction of [1, -1]) {
    const lanes = direction === 1 ? track.sameWayLanes : track.oncomingLanes;
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
          x: laneFor(lanes, cruiseSpeed, random),
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
  readonly along: readonly number[];
  readonly longest: number;
}

const laneIndexOf = (track: Track, car: TrafficCar): number =>
  Math.min(
    track.plan.lanesEachWay - 1,
    Math.floor(Math.abs(car.x) / track.plan.laneWidth)
  );

const laneOf = (
  track: Track,
  cars: readonly TrafficCar[],
  lastS: readonly number[],
  direction: number,
  laneIndex: number
): Lane => {
  const order: number[] = [];
  let longest = 0;
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (
      car &&
      Math.sign(car.cruiseSpeed) === direction &&
      laneIndexOf(track, car) === laneIndex
    ) {
      order.push(index);
      longest = Math.max(longest, car.halfLength);
    }
  }
  order.sort(
    (left, right) => ((lastS[left] ?? 0) - (lastS[right] ?? 0)) * direction
  );
  return {
    along: order.map((index) => (lastS[index] ?? 0) * direction),
    direction,
    longest,
    order,
  };
};

interface Flow {
  readonly cars: readonly TrafficCar[];
  readonly lastS: readonly number[];
  readonly lastSpeed: readonly number[];
  readonly target: number[];
}

const followLane = (flow: Flow, lane: Lane): void => {
  const { cars, lastS, lastSpeed, target } = flow;
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
    target[index] = targetSpeed;
  }
};

const firstPast = (along: readonly number[], point: number): number => {
  let low = 0;
  let high = along.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((along[middle] ?? 0) <= point) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

const yieldTo = (
  flow: Flow,
  lane: Lane,
  rider: RiderState,
  point: number
): void => {
  const { cars, lastSpeed, target } = flow;
  const { along, direction, longest, order } = lane;
  const riderSpeed =
    rider.mode === "riding" ? Math.max(0, rider.speed * direction) : 0;
  const reach = point * direction;
  const sight = LOOK_AHEAD + longest + BIKE_HALF_LENGTH;
  for (
    let place = firstPast(along, reach - sight);
    place < order.length && (along[place] ?? reach) < reach;
    place += 1
  ) {
    const index = order[place] ?? -1;
    const car = cars[index];
    const speed = lastSpeed[index] ?? 0;
    if (car && riderSpeed <= speed) {
      const gap = gapToRider(car, rider);
      const stoppingRoom =
        (speed * speed - riderSpeed * riderSpeed) / (2 * BRAKING) + 8;
      if (gap < LOOK_AHEAD && gap < stoppingRoom) {
        target[index] = Math.min(target[index] ?? riderSpeed, riderSpeed);
      }
    }
  }
};

export const stepTraffic = (state: RaceState, track: Track): void => {
  const { cars, riders } = state;
  const flow: Flow = {
    cars,
    lastS: cars.map((car) => car.s),
    lastSpeed: cars.map((car) => Math.abs(car.speed)),
    target: cars.map((car) => Math.abs(car.cruiseSpeed)),
  };
  for (const direction of [1, -1]) {
    for (
      let laneIndex = 0;
      laneIndex < track.plan.lanesEachWay;
      laneIndex += 1
    ) {
      const lane = laneOf(track, cars, flow.lastS, direction, laneIndex);
      followLane(flow, lane);
      for (const rider of riders) {
        yieldTo(flow, lane, rider, rider.s);
        if (rider.bodyS !== rider.s) {
          yieldTo(flow, lane, rider, rider.bodyS);
        }
      }
    }
  }
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (!car) {
      continue;
    }
    const direction = Math.sign(car.cruiseSpeed);
    const speed = flow.lastSpeed[index] ?? 0;
    const targetSpeed = flow.target[index] ?? Math.abs(car.cruiseSpeed);
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
