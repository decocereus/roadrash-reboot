import { openLanesAt, trafficReachAt } from "@racer/track/districts";
import type { LaneCentres } from "@racer/track/districts";
import type { Random } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import { carrierAt, clearOfCarrier } from "./carrier.ts";
import { blocksCars } from "./pedestrians.ts";
import { isSignalled, mainLightOf, signalPhaseAt } from "./signals.ts";
import {
  approach,
  BIKE_HALF_LENGTH,
  TICK_SECONDS,
  WALKING_PACE,
} from "./state.ts";
import type {
  Pedestrian,
  RaceConditions,
  RaceState,
  RiderState,
  TrafficCar,
} from "./state.ts";

const CLEAR_START_FROM = -70;
const CLEAR_START_TO = 260;
const CLEAR_ONCOMING_START_TO = 300;
export const BRAKING = 7;
export const ACCELERATION = 2.5;
const FOLLOW_GAP = 10;
const FOLLOW_SECONDS = 0.9;
const LOOK_AHEAD = 70;
export const PAINT_COUNT = 6;
const SLOW_CRUISE = 23;
const FAVOURED_LANE_SHARE = 0.8;
const FAVOURED_OF_THREE_SHARE = 0.6;
const MIDDLE_OF_THREE_SHARE = 0.3;
const MERGE_SIGHT = 100;
const MERGE_ROOM = 5;
const MERGE_EASE = 8;
export const STOP_SHORT = 1;
export const QUEUE_GAP = 2;
const STOP_SIGHT = 150;
const WALKER_MARGIN = 1.5;
const WALKER_HOLD_SECONDS = 1.5;
const LEAST_PATIENCE_TICKS = 90;
const MOST_PATIENCE_TICKS = 180;
const CONVOY_CARS = 6;
const CONVOY_GAP = 14;
const CONVOY_CRUISE = 15;
const CONVOY_JITTER = 400;
const directions = [1, -1] as const;

export interface Body {
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly height: number;
}

const sedan: Body = { halfLength: 2.2, halfWidth: 0.92, height: 1.45 };
const van: Body = { halfLength: 2.6, halfWidth: 1, height: 2.1 };
const truck: Body = { halfLength: 4.2, halfWidth: 1.2, height: 3.1 };

export const pickBody = (roll: number): Body => {
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
  const slow = Math.abs(cruiseSpeed) < SLOW_CRUISE;
  switch (lanes.length) {
    case 1: {
      return lanes[0];
    }
    case 2: {
      const [inner, outer] = lanes;
      const favoured = slow ? outer : inner;
      const other = favoured === outer ? inner : outer;
      return random() < FAVOURED_LANE_SHARE ? favoured : other;
    }
    case 3: {
      const [inner, middle, outer] = lanes;
      const [favoured, least] = slow ? [outer, inner] : [inner, outer];
      const roll = random();
      if (roll < FAVOURED_OF_THREE_SHARE) {
        return favoured;
      }
      return roll < FAVOURED_OF_THREE_SHARE + MIDDLE_OF_THREE_SHARE
        ? middle
        : least;
    }
    default: {
      return lanes satisfies never;
    }
  }
};

const narrows = (track: Track): boolean => track.plan.districts.length > 1;

const seatCar = (car: TrafficCar, track: Track): void => {
  car.x =
    Math.sign(car.home) *
    Math.min(Math.abs(car.home), trafficReachAt(track, car.s));
};

export const seatCars = (cars: readonly TrafficCar[], track: Track): void => {
  if (narrows(track)) {
    for (const car of cars) {
      seatCar(car, track);
    }
  }
};

const patienceOf = (random: Random): number =>
  Math.round(
    LEAST_PATIENCE_TICKS +
      random() * (MOST_PATIENCE_TICKS - LEAST_PATIENCE_TICKS)
  );

const convoysOf = (
  track: Track,
  count: number,
  random: Random,
  patience: Random
): TrafficCar[] => {
  const span = track.endS - track.startS;
  return Array.from({ length: count }).flatMap((_, convoy) => {
    const lead =
      track.startS +
      (span * (convoy + 1)) / (count + 1) +
      (random() - 0.5) * CONVOY_JITTER;
    return Array.from({ length: CONVOY_CARS }, (__, place) => {
      const home = track.sameWayLanes[place % track.sameWayLanes.length] ?? 0;
      return {
        ...pickBody(random()),
        carrier: false,
        cruiseSpeed: CONVOY_CRUISE,
        home,
        paint: Math.floor(random() * PAINT_COUNT),
        patience: patienceOf(patience),
        s: lead - place * CONVOY_GAP,
        speed: CONVOY_CRUISE,
        waited: 0,
        x: home,
      };
    });
  });
};

const clearOfConvoys = (
  car: TrafficCar,
  convoys: readonly TrafficCar[]
): boolean =>
  car.cruiseSpeed < 0 ||
  convoys.every((other) => Math.abs(car.s - other.s) > CONVOY_GAP);

export const createTraffic = (
  track: Track,
  random: Random,
  patience: Random,
  conditions: RaceConditions,
  convoyRandom: Random
): TrafficCar[] => {
  const cars: TrafficCar[] = [];
  const span = track.endS - track.startS;
  const perDirection = Math.round(
    (track.plan.trafficPerKilometre * conditions.trafficDensity * span) / 1000
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
        const paint = Math.floor(random() * PAINT_COUNT);
        const home = laneFor(lanes, cruiseSpeed, random);
        cars.push({
          ...body,
          carrier: false,
          cruiseSpeed,
          home,
          paint,
          patience: patienceOf(patience),
          s,
          speed: cruiseSpeed,
          waited: 0,
          x: home,
        });
      }
    }
  }
  seatCars(cars, track);
  const [lane] = track.sameWayLanes;
  const carriers = track.carrierStarts.map((s) =>
    carrierAt(s, lane, Math.floor(random() * PAINT_COUNT), patienceOf(patience))
  );
  const convoys = convoysOf(
    track,
    conditions.slowConvoys,
    convoyRandom,
    patience
  );
  seatCars(convoys, track);
  return [
    ...cars.filter(
      (car) =>
        carriers.every((carrier) =>
          clearOfCarrier(car, carrier.s, carrier.x)
        ) && clearOfConvoys(car, convoys)
    ),
    ...convoys,
    ...carriers,
  ];
};

const gapToRider = (car: TrafficCar, rider: RiderState): number => {
  if (rider.mode === "busted" || (rider.mode === "wrecked" && rider.parked)) {
    return Number.POSITIVE_INFINITY;
  }
  const direction = Math.sign(car.cruiseSpeed);
  const riding = rider.mode === "riding" || rider.mode === "mounting";
  const reach = car.halfWidth + 0.9;
  const bikeGap = (rider.s - car.s) * direction;
  const bodyGap = (rider.bodyS - car.s) * direction;
  const nearest = Math.min(
    bikeGap > 0 && Math.abs(rider.x - car.x) < reach
      ? bikeGap
      : Number.POSITIVE_INFINITY,
    bodyGap > 0 && Math.abs((riding ? rider.x : rider.bodyX) - car.x) < reach
      ? bodyGap
      : Number.POSITIVE_INFINITY
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

const isDownOnTheRoad = (rider: RiderState): boolean =>
  rider.mode === "thrown" ||
  rider.mode === "lying" ||
  rider.mode === "running" ||
  rider.mode === "wrecked";

interface Flow {
  readonly facingDown: boolean[];
  readonly merging: boolean[];
  readonly occupied: number[];
  readonly queue: number[];
  readonly lastS: number[];
  readonly lastSpeed: number[];
  readonly target: number[];
  readonly lane: Lane;
}

const trafficFlow: Flow = {
  facingDown: [],
  lane: { along: [], count: 0, direction: 1, longest: 0, order: [] },
  lastS: [],
  lastSpeed: [],
  merging: [],
  occupied: [],
  queue: [],
  target: [],
};

const occupiedLaneOf = (track: Track, car: TrafficCar): number =>
  Math.min(
    track.sameWayLanes.length - 1,
    Math.floor(Math.abs(car.x) / track.plan.laneWidth)
  );

const queueOf = (track: Track, car: TrafficCar, occupied: number): number =>
  Math.min(
    openLanesAt(track, car.s) - 1,
    openLanesAt(track, car.s + Math.sign(car.cruiseSpeed) * MERGE_SIGHT) - 1,
    occupied
  );

const gatherLane = (
  cars: readonly TrafficCar[],
  flow: Flow,
  direction: number,
  laneIndex: number
): void => {
  const { lane, lastS, occupied, queue } = flow;
  const { along, order } = lane;
  lane.direction = direction;
  lane.count = 0;
  lane.longest = 0;
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (
      car &&
      Math.sign(car.cruiseSpeed) === direction &&
      (queue[index] === laneIndex || occupied[index] === laneIndex)
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
  const { lane, lastS, lastSpeed, merging, target } = flow;
  const { count, direction, longest, order } = lane;
  for (let place = 0; place < count; place += 1) {
    const index = order[place] ?? -1;
    const car = cars[index];
    if (!car) {
      continue;
    }
    const s = lastS[index] ?? car.s;
    const speed = lastSpeed[index] ?? 0;
    const reach = FOLLOW_GAP + speed * FOLLOW_SECONDS;
    const stoppingRoom = (speed * speed) / (2 * BRAKING);
    const sight = Math.max(reach, stoppingRoom + QUEUE_GAP);
    let targetSpeed = Math.abs(car.cruiseSpeed);
    for (let ahead = place + 1; ahead < count; ahead += 1) {
      const otherIndex = order[ahead] ?? -1;
      const other = cars[otherIndex];
      if (!other) {
        continue;
      }
      const apart = ((lastS[otherIndex] ?? other.s) - s) * direction;
      if (apart - longest - car.halfLength >= sight) {
        break;
      }
      const gap = apart - other.halfLength - car.halfLength;
      const otherSpeed = lastSpeed[otherIndex] ?? 0;
      const closingRoom =
        stoppingRoom - (otherSpeed * otherSpeed) / (2 * BRAKING) + QUEUE_GAP;
      if (gap > 0 && gap < Math.max(reach, closingRoom)) {
        targetSpeed = Math.min(targetSpeed, otherSpeed);
      }
      if (
        gap < MERGE_ROOM &&
        (merging[index] === true || merging[otherIndex] === true)
      ) {
        targetSpeed = Math.min(
          targetSpeed,
          Math.max(0, otherSpeed - MERGE_EASE)
        );
      }
    }
    target[index] = Math.min(target[index] ?? targetSpeed, targetSpeed);
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

const stopAtLights = (
  track: Track,
  cars: readonly TrafficCar[],
  flow: Flow,
  tick: number
): void => {
  const { lane, lastSpeed, target } = flow;
  const { along, direction, order } = lane;
  for (const crossing of track.crossings) {
    if (
      isSignalled(crossing) &&
      mainLightOf(signalPhaseAt(crossing, tick)) !== "green"
    ) {
      const line = direction * crossing.s - crossing.stopGap - STOP_SHORT;
      let limit = line;
      let queued = false;
      for (
        let place = firstPast(lane, line) - 1;
        place >= 0 && (along[place] ?? line) > line - STOP_SIGHT;
        place -= 1
      ) {
        const index = order[place] ?? -1;
        const car = cars[index];
        if (car) {
          const carAlong = along[place] ?? line;
          const room = limit - carAlong - car.halfLength;
          const speed = lastSpeed[index] ?? 0;
          if (room + STOP_SHORT >= (speed * speed) / (2 * BRAKING)) {
            const stopping = Math.sqrt(2 * BRAKING * Math.max(0, room));
            target[index] = Math.min(
              queued ? Math.abs(car.cruiseSpeed) : (target[index] ?? 0),
              stopping
            );
            limit = Math.min(
              limit - 2 * car.halfLength - QUEUE_GAP,
              carAlong - car.halfLength - QUEUE_GAP
            );
            queued = true;
          } else {
            queued = false;
          }
        }
      }
    }
  }
};

const yieldTo = (
  cars: readonly TrafficCar[],
  flow: Flow,
  rider: RiderState,
  point: number
): void => {
  const { facingDown, lane, lastSpeed, target } = flow;
  const { along, count, direction, longest, order } = lane;
  const down = isDownOnTheRoad(rider);
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
        facingDown[index] ||= down;
        if (!down || car.waited < car.patience) {
          target[index] = Math.min(target[index] ?? riderSpeed, riderSpeed);
        }
      }
    }
  }
};

export const walkerComesInto = (
  pedestrian: Pedestrian,
  pace: number,
  x: number,
  reach: number
): boolean => {
  const seconds = pace / BRAKING + WALKER_HOLD_SECONDS;
  const ahead = pedestrian.x + pedestrian.drift * seconds;
  return (
    x > Math.min(pedestrian.x, ahead) - reach &&
    x < Math.max(pedestrian.x, ahead) + reach
  );
};

const yieldToWalker = (
  cars: readonly TrafficCar[],
  flow: Flow,
  pedestrian: Pedestrian
): void => {
  const { lane, lastSpeed, target } = flow;
  const { along, count, direction, longest, order } = lane;
  const reach = pedestrian.s * direction;
  for (
    let place = firstPast(lane, reach - LOOK_AHEAD - longest);
    place < count && (along[place] ?? reach) < reach;
    place += 1
  ) {
    const index = order[place] ?? -1;
    const car = cars[index];
    const speed = lastSpeed[index] ?? 0;
    if (
      car &&
      walkerComesInto(pedestrian, speed, car.x, car.halfWidth + WALKER_MARGIN)
    ) {
      const gap = reach - (along[place] ?? reach) - car.halfLength;
      if (gap < LOOK_AHEAD && gap < (speed * speed) / (2 * BRAKING) + 8) {
        target[index] = 0;
      }
    }
  }
};

const readCars = (cars: readonly TrafficCar[], track: Track): void => {
  const { facingDown, lastS, lastSpeed, merging, occupied, queue, target } =
    trafficFlow;
  const offHomeCounts = narrows(track);
  const { laneWidth } = track.plan;
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    if (car) {
      const inLane = occupiedLaneOf(track, car);
      const lane = queueOf(track, car, inLane);
      occupied[index] = inLane;
      queue[index] = lane;
      merging[index] =
        offHomeCounts &&
        (car.x !== car.home ||
          lane < Math.floor(Math.abs(car.home) / laneWidth));
      lastS[index] = car.s;
      lastSpeed[index] = Math.abs(car.speed);
      target[index] = Math.abs(car.cruiseSpeed);
      facingDown[index] = false;
    }
  }
};

export const stepTraffic = (state: RaceState, track: Track): void => {
  const { cars, riders } = state;
  const { facingDown, lastSpeed, target } = trafficFlow;
  const moveAcross = narrows(track);
  readCars(cars, track);
  for (const direction of directions) {
    for (
      let laneIndex = 0;
      laneIndex < track.sameWayLanes.length;
      laneIndex += 1
    ) {
      gatherLane(cars, trafficFlow, direction, laneIndex);
      followLane(cars, trafficFlow);
      stopAtLights(track, cars, trafficFlow, state.tick);
      for (const pedestrian of state.pedestrians) {
        if (blocksCars(pedestrian)) {
          yieldToWalker(cars, trafficFlow, pedestrian);
        }
      }
      for (const rider of riders) {
        yieldTo(cars, trafficFlow, rider, rider.s);
        if (rider.bodyS !== rider.s) {
          yieldTo(cars, trafficFlow, rider, rider.bodyS);
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
    if (facingDown[index] === true) {
      car.waited += speed < WALKING_PACE ? 1 : 0;
    } else {
      car.waited = 0;
    }
    const rate = targetSpeed < speed ? BRAKING : ACCELERATION;
    car.speed = direction * approach(speed, targetSpeed, rate * TICK_SECONDS);
    car.s += car.speed * TICK_SECONDS;
    if (car.s > track.endS) {
      car.s = track.startS;
    } else if (car.s < track.startS) {
      car.s = track.endS;
    }
    if (moveAcross) {
      seatCar(car, track);
    }
  }
};
