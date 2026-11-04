import { ARM_LENGTH, armSidesOf } from "@racer/track/crossings";
import type { ArmSide, CrossRoad, TrackCrossing } from "@racer/track/crossings";
import { fewestOpenLanesAlong, roadHalfWidthAt } from "@racer/track/districts";
import { nextSeed, rollDice, siteSeed } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import { blocksCars } from "./pedestrians.ts";
import { crossLightOf, isSignalled, signalPhaseAt } from "./signals.ts";
import {
  approach,
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  TICK_RATE,
  TICK_SECONDS,
} from "./state.ts";
import type { CrossCar, Pedestrian, RaceState, RiderState } from "./state.ts";
import {
  ACCELERATION,
  BRAKING,
  PAINT_COUNT,
  pickBody,
  QUEUE_GAP,
  STOP_SHORT,
  walkerComesInto,
} from "./traffic.ts";

const CARS_PER_LANE = 3;
const SLOWEST_CRUISE = 11;
const CRUISE_SPREAD = 4;
const STOP_LINE_OUT = 1.2;
const TURN_SPEED = 8;
const RUN_SPEED = 19;
const LEAST_RUN = 200;
const IN_VIEW = 200;
const CLEAR_SECONDS = 5;
const BOX_MARGIN = 6;
const LANE_REACH = 1.5;
const YIELD_MARGIN = 0.9;
const YIELD_SIGHT = 40;
const YIELD_ROOM = 8;
const TURN_REACH = 15;
const SECONDS_PER_MINUTE = 60;

const waitOf = (car: CrossCar): number =>
  1 + Math.floor(rollDice(car) * 2 * car.everyTicks);

const placeOnPath = (car: CrossCar): void => {
  const past = car.travel - car.turnAt;
  if (past > 0) {
    car.s = car.laneS + car.along * past;
    car.x = car.fromX + car.across * car.turnAt;
    car.speed = car.along * car.pace;
    car.drift = 0;
    car.halfLength = car.bodyHalfLength;
    car.halfWidth = car.bodyHalfWidth;
    return;
  }
  car.s = car.laneS;
  car.x = car.fromX + car.across * car.travel;
  car.speed = 0;
  car.drift = car.across * car.pace;
  car.halfLength = car.bodyHalfWidth;
  car.halfWidth = car.bodyHalfLength;
};

interface Lane {
  readonly junction: number;
  readonly road: CrossRoad;
  readonly side: ArmSide;
  readonly laneS: number;
}

const exitLane = (
  track: Track,
  laneS: number,
  side: ArmSide,
  along: ArmSide
): number => {
  const lanes = along === 1 ? track.sameWayLanes : track.oncomingLanes;
  const open = fewestOpenLanesAlong(
    track,
    laneS,
    along === 1 ? track.endS : track.startS
  );
  return along === side ? (lanes[open - 1] ?? lanes[0]) : lanes[0];
};

const carFor = (track: Track, lane: Lane, seed: number): CrossCar => {
  const { junction, laneS, road, side } = lane;
  const dice = { dice: seed };
  const body = pickBody(rollDice(dice));
  const start = roadHalfWidthAt(track, laneS) + ARM_LENGTH;
  const across: ArmSide = side === 1 ? -1 : 1;
  const stopAt = ARM_LENGTH - STOP_LINE_OUT - STOP_SHORT - body.halfLength;
  const along: ArmSide = rollDice(dice) < 0.5 ? 1 : -1;
  const through = road.arms === "both";
  const everyTicks =
    (CARS_PER_LANE * SECONDS_PER_MINUTE * TICK_RATE * road.lanesEachWay) /
    road.carsPerMinute;
  const cruise = SLOWEST_CRUISE + rollDice(dice) * CRUISE_SPREAD;
  const car: CrossCar = {
    across,
    along,
    bodyHalfLength: body.halfLength,
    bodyHalfWidth: body.halfWidth,
    cruise,
    dice: dice.dice,
    drift: 0,
    endAt: through ? 2 * start : LEAST_RUN,
    everyTicks,
    fromX: side * start,
    halfLength: body.halfWidth,
    halfWidth: body.halfLength,
    height: body.height,
    junction,
    laneS,
    pace: cruise,
    paint: Math.floor(rollDice(dice) * PAINT_COUNT),
    s: laneS,
    speed: 0,
    stopAt,
    travel: 0,
    turnAt: through
      ? Number.POSITIVE_INFINITY
      : start - side * exitLane(track, laneS, side, along),
    wait: 0,
    x: side * start,
  };
  car.wait = waitOf(car);
  placeOnPath(car);
  return car;
};

export const createCrossTraffic = (track: Track, seed: number): CrossCar[] => {
  const cars: CrossCar[] = [];
  for (let junction = 0; junction < track.crossings.length; junction += 1) {
    const crossing = track.crossings[junction];
    const road = crossing?.road;
    if (crossing && road && road.carsPerMinute > 0) {
      let site = siteSeed(seed, crossing.id);
      for (const side of armSidesOf(road)) {
        for (let index = 0; index < road.lanesEachWay; index += 1) {
          const laneS = crossing.s + side * (index + 0.5) * road.laneWidth;
          const lane = { junction, laneS, road, side };
          for (let place = 0; place < CARS_PER_LANE; place += 1) {
            site = nextSeed(site);
            cars.push(carFor(track, lane, site));
          }
        }
      }
    }
  }
  return cars;
};

export const onRoad = (car: CrossCar): boolean => car.wait === 0;

const laneFreeAtStart = (
  cars: readonly CrossCar[],
  index: number,
  car: CrossCar
): boolean => {
  const first = index - (index % CARS_PER_LANE);
  for (let place = first; place < first + CARS_PER_LANE; place += 1) {
    const other = cars[place];
    if (
      other &&
      other !== car &&
      onRoad(other) &&
      other.travel - other.bodyHalfLength - car.bodyHalfLength < QUEUE_GAP
    ) {
      return false;
    }
  }
  return true;
};

const behindCars = (
  cars: readonly CrossCar[],
  index: number,
  car: CrossCar
): number => {
  const first = index - (index % CARS_PER_LANE);
  let limit = Number.POSITIVE_INFINITY;
  for (let place = first; place < first + CARS_PER_LANE; place += 1) {
    const other = cars[place];
    if (other && onRoad(other) && other.travel > car.travel) {
      const gap =
        other.travel -
        car.travel -
        other.bodyHalfLength -
        car.bodyHalfLength -
        QUEUE_GAP;
      limit = Math.min(
        limit,
        Math.sqrt(other.pace * other.pace + 2 * BRAKING * Math.max(0, gap))
      );
    }
  }
  return limit;
};

const gapInTraffic = (
  state: RaceState,
  crossing: TrackCrossing,
  car: CrossCar
): boolean => {
  const from = car.fromX + car.across * car.stopAt;
  const to =
    car.turnAt < Number.POSITIVE_INFINITY
      ? car.fromX + car.across * car.turnAt
      : car.fromX + car.across * car.endAt;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  for (const other of state.cars) {
    if (other.x > low - LANE_REACH && other.x < high + LANE_REACH) {
      const toBox = (crossing.s - other.s) * Math.sign(other.cruiseSpeed);
      if (
        toBox > -BOX_MARGIN &&
        toBox < CLEAR_SECONDS * Math.abs(other.speed) + BOX_MARGIN
      ) {
        return false;
      }
    }
  }
  return true;
};

const heldAtLine = (
  state: RaceState,
  crossing: TrackCrossing,
  car: CrossCar
): boolean =>
  isSignalled(crossing)
    ? crossLightOf(signalPhaseAt(crossing, state.tick)) !== "green"
    : !gapInTraffic(state, crossing, car);

const beforeLine = (state: RaceState, track: Track, car: CrossCar): number => {
  const room = car.stopAt - car.travel;
  const crossing = track.crossings[car.junction];
  if (
    !crossing ||
    room + STOP_SHORT < (car.pace * car.pace) / (2 * BRAKING) ||
    !heldAtLine(state, crossing, car)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.sqrt(2 * BRAKING * Math.max(0, room));
};

const gapToPoint = (car: CrossCar, s: number, x: number): number => {
  if (car.travel <= car.turnAt) {
    return Math.abs(s - car.s) < car.halfLength + YIELD_MARGIN
      ? (x - car.x) * car.across - car.halfWidth - BIKE_HALF_WIDTH
      : Number.POSITIVE_INFINITY;
  }
  return Math.abs(x - car.x) < car.halfWidth + YIELD_MARGIN
    ? (s - car.s) * car.along - car.halfLength - BIKE_HALF_LENGTH
    : Number.POSITIVE_INFINITY;
};

const gapToWalkerPastTurn = (car: CrossCar, pedestrian: Pedestrian): number => {
  const past = (pedestrian.s - car.laneS) * car.along;
  return car.turnAt < Number.POSITIVE_INFINITY &&
    past > 0 &&
    past < TURN_REACH &&
    walkerComesInto(
      pedestrian,
      car.pace,
      car.fromX + car.across * car.turnAt,
      car.bodyHalfWidth + YIELD_MARGIN
    )
    ? car.turnAt - car.travel
    : Number.POSITIVE_INFINITY;
};

const gapToWalker = (car: CrossCar, pedestrian: Pedestrian): number => {
  if (car.travel <= car.turnAt) {
    return Math.min(
      gapToPoint(car, pedestrian.s, pedestrian.x),
      gapToWalkerPastTurn(car, pedestrian)
    );
  }
  return walkerComesInto(
    pedestrian,
    car.pace,
    car.x,
    car.halfWidth + YIELD_MARGIN
  )
    ? (pedestrian.s - car.s) * car.along - car.halfLength - BIKE_HALF_LENGTH
    : Number.POSITIVE_INFINITY;
};

const stopsShort = (car: CrossCar, gap: number): boolean =>
  gap > 0 &&
  gap < YIELD_SIGHT &&
  gap < (car.pace * car.pace) / (2 * BRAKING) + YIELD_ROOM;

const stopsFor = (car: CrossCar, rider: RiderState, gap: number): boolean =>
  rider.mode !== "busted" &&
  !(rider.mode === "wrecked" && rider.parked) &&
  stopsShort(car, gap);

const yields = (state: RaceState, car: CrossCar): boolean => {
  for (const rider of state.riders) {
    if (
      stopsFor(car, rider, gapToPoint(car, rider.s, rider.x)) ||
      stopsFor(car, rider, gapToPoint(car, rider.bodyS, rider.bodyX))
    ) {
      return true;
    }
  }
  for (const pedestrian of state.pedestrians) {
    if (
      blocksCars(pedestrian) &&
      stopsShort(car, gapToWalker(car, pedestrian))
    ) {
      return true;
    }
  }
  return false;
};

const beforeCorner = (car: CrossCar): number => {
  const room = car.turnAt - car.travel;
  if (room <= 0 || room === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.sqrt(TURN_SPEED * TURN_SPEED + 2 * BRAKING * room);
};

const inSomeonesView = (state: RaceState, car: CrossCar): boolean => {
  for (const rider of state.riders) {
    if (car.s > rider.s && car.s < rider.s + IN_VIEW) {
      return true;
    }
  }
  return false;
};

const finished = (state: RaceState, track: Track, car: CrossCar): boolean => {
  if (car.turnAt === Number.POSITIVE_INFINITY) {
    return car.travel >= car.endAt;
  }
  const past = car.travel - car.turnAt;
  return (
    car.s < track.startS ||
    car.s > track.endS ||
    (past >= car.endAt && !inSomeonesView(state, car))
  );
};

const drive = (
  state: RaceState,
  track: Track,
  cars: readonly CrossCar[],
  index: number,
  car: CrossCar
): void => {
  const cruise = car.travel > car.turnAt ? RUN_SPEED : car.cruise;
  const limit = yields(state, car)
    ? 0
    : Math.min(
        cruise,
        behindCars(cars, index, car),
        beforeLine(state, track, car),
        beforeCorner(car)
      );
  const rate = limit < car.pace ? BRAKING : ACCELERATION;
  car.pace = approach(car.pace, limit, rate * TICK_SECONDS);
  car.travel += car.pace * TICK_SECONDS;
  placeOnPath(car);
  if (finished(state, track, car)) {
    car.wait = waitOf(car);
    car.travel = 0;
    car.pace = car.cruise;
    placeOnPath(car);
  }
};

export const stepCrossTraffic = (state: RaceState, track: Track): void => {
  const { crossCars } = state;
  for (let index = 0; index < crossCars.length; index += 1) {
    const car = crossCars[index];
    if (car) {
      if (car.wait > 0) {
        car.wait -= 1;
        if (car.wait === 0 && !laneFreeAtStart(crossCars, index, car)) {
          car.wait = 1;
        }
      } else {
        drive(state, track, crossCars, index, car);
      }
    }
  }
};
