import type { Random } from "@racer/track/random";
import type { LaneCentres, Track } from "@racer/track/track";

import {
  approach,
  BIKE_HALF_LENGTH,
  raceOwned,
  TICK_SECONDS,
} from "./state.ts";
import type { RaceState, RiderState, TrafficCar } from "./state.ts";

const CLEAR_START_FROM = -70;
const CLEAR_START_TO = 260;
const CLEAR_ONCOMING_START_TO = 300;
const BRAKING = 7;
const ACCELERATION = 2.5;
const FOLLOW_GAP = 10;
const FOLLOW_SECONDS = 0.9;
const LOOK_AHEAD = 70;
const PAINT_COUNT = 6;
const SLOW_CRUISE = 23;
const FAVOURED_LANE_SHARE = 0.8;
const directions = [1, -1] as const;

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
  lanes: LaneCentres,
  cruiseSpeed: number,
  random: Random
): number => {
  if (lanes.length === 1) {
    return lanes[0];
  }
  const [inner, outer] = lanes;
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
  for (const direction of directions) {
    const lanes = direction === 1 ? track.sameWayLanes : track.oncomingLanes;
    for (let index = 0; index < perDirection; index += 1) {
      const s = track.startS + (index + 0.15 + random() * 0.7) * spacing;
      const body = pickBody(random());
      const cruiseSpeed = direction * (19 + random() * 8);
      const clearTo =
        direction === 1 ? CLEAR_START_TO : CLEAR_ONCOMING_START_TO;
      const blocksStart = s > CLEAR_START_FROM && s < clearTo;
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
  direction: number;
  count: number;
  longest: number;
  readonly order: number[];
  readonly along: number[];
}

interface Flow {
  readonly lastS: number[];
  readonly lastSpeed: number[];
  readonly target: number[];
  readonly lane: Lane;
}

const flowOf = raceOwned((): Flow => ({
  lane: { along: [], count: 0, direction: 1, longest: 0, order: [] },
  lastS: [],
  lastSpeed: [],
  target: [],
}));

const laneIndexOf = (track: Track, car: TrafficCar): number =>
  Math.min(
    track.plan.lanesEachWay - 1,
    Math.floor(Math.abs(car.x) / track.plan.laneWidth)
  );

const gatherLane = (
  track: Track,
  cars: readonly TrafficCar[],
  flow: Flow,
  direction: number,
  laneIndex: number
): void => {
  const { lane, lastS } = flow;
  const { along, order } = lane;
  lane.direction = direction;
  lane.count = 0;
  lane.longest = 0;
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (
      car &&
      Math.sign(car.cruiseSpeed) === direction &&
      laneIndexOf(track, car) === laneIndex
    ) {
      const carAlong = (lastS[index] ?? 0) * direction;
      let place = lane.count;
      while (place > 0 && (along[place - 1] ?? 0) > carAlong) {
        order[place] = order[place - 1] ?? -1;
        along[place] = along[place - 1] ?? 0;
        place -= 1;
      }
      order[place] = index;
      along[place] = carAlong;
      lane.count += 1;
      lane.longest = Math.max(lane.longest, car.halfLength);
    }
  }
};

const followLane = (cars: readonly TrafficCar[], flow: Flow): void => {
  const { lane, lastS, lastSpeed, target } = flow;
  const { count, direction, longest, order } = lane;
  for (let place = 0; place < count; place += 1) {
    const index = order[place] ?? -1;
    const car = cars[index];
    if (!car) {
      continue;
    }
    const s = lastS[index] ?? car.s;
    const reach = FOLLOW_GAP + (lastSpeed[index] ?? 0) * FOLLOW_SECONDS;
    let targetSpeed = Math.abs(car.cruiseSpeed);
    for (let ahead = place + 1; ahead < count; ahead += 1) {
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

const firstPast = (lane: Lane, point: number): number => {
  const { along } = lane;
  let low = 0;
  let high = lane.count;
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
  cars: readonly TrafficCar[],
  flow: Flow,
  rider: RiderState,
  point: number
): void => {
  const { lane, lastSpeed, target } = flow;
  const { along, count, direction, longest, order } = lane;
  const riderSpeed =
    rider.mode === "riding" ? Math.max(0, rider.speed * direction) : 0;
  const reach = point * direction;
  const sight = LOOK_AHEAD + longest + BIKE_HALF_LENGTH;
  for (
    let place = firstPast(lane, reach - sight);
    place < count && (along[place] ?? reach) < reach;
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
  const flow = flowOf(state);
  const { lastS, lastSpeed, target } = flow;
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (car) {
      lastS[index] = car.s;
      lastSpeed[index] = Math.abs(car.speed);
      target[index] = Math.abs(car.cruiseSpeed);
    }
  }
  for (const direction of directions) {
    for (
      let laneIndex = 0;
      laneIndex < track.plan.lanesEachWay;
      laneIndex += 1
    ) {
      gatherLane(track, cars, flow, direction, laneIndex);
      followLane(cars, flow);
      for (const rider of riders) {
        yieldTo(cars, flow, rider, rider.s);
        if (rider.bodyS !== rider.s) {
          yieldTo(cars, flow, rider, rider.bodyS);
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
    const speed = lastSpeed[index] ?? 0;
    const targetSpeed = target[index] ?? Math.abs(car.cruiseSpeed);
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
