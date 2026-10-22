import { nextJumpFrom } from "@racer/track/features";
import type { Track } from "@racer/track/track";

import {
  JUMP_WALL_CLEARANCE,
  measureDeceleration,
  planForecast,
  PLANNED_BRAKING,
} from "./pilot-corners.ts";
import type { Slick } from "./pilot-corners.ts";
import {
  dodgeReach,
  gatherInSight,
  gatherObstructions,
  inSight,
  measureHorizons,
  planCourse,
  ROCK_THROUGH_SPEED,
  sightOf,
  toll,
  weigh,
} from "./pilot-forecast.ts";
import type { PilotHistory } from "./pilot-history.ts";
import { BIKE_HALF_WIDTH } from "./state.ts";
import type { RaceState, RiderState, TrafficCar } from "./state.ts";

const FOLLOW_SECONDS = 2.4;
const ONCOMING_SECONDS = 4.5;
const ONCOMING_ENTRY_SECONDS = 8;
const START_TICKS = 600;
const START_ONCOMING_ENTRY_SECONDS = 12;
const CENTRE_SEAM_BIAS = 0.6;
const LANE_REACH = 1.7;
const SPLITTING_SPEED = 8;
const RIDER_FOLLOW_SECONDS = 1.2;
const CROSSING_SECONDS = 1.5;
const OWN_LANE_REACH = 1;
const DODGE_EDGE = 0.2;
const MOVE_COST = 0.05;
const LANE_RANK_COST = 1;
const OFF_LANE_COST = 0.2;
const PURSUIT_COST = -1;
const HYSTERESIS = 0.15;
const LINE_MATCH = 0.05;
const PASS_MARGIN = 0.3;
const FOLLOW_COST = 5;

export const slickAhead: Slick = {
  metres: Number.POSITIVE_INFINITY,
  speed: Number.POSITIVE_INFINITY,
};

interface Threat {
  readonly seconds: number;
  readonly speed: number;
}

interface Obstacle {
  readonly s: number;
  readonly x: number;
  readonly speed: number;
  readonly halfLength: number;
}

const secondsUntilContact = (rider: RiderState, obstacle: Obstacle): number => {
  const gap = obstacle.s - rider.s - obstacle.halfLength - 1;
  const closingSpeed = rider.speed - obstacle.speed;
  if (gap < -2 * obstacle.halfLength - 2) {
    return Number.POSITIVE_INFINITY;
  }
  if (gap <= 0) {
    return 0;
  }
  return closingSpeed > 0 ? gap / closingSpeed : Number.POSITIVE_INFINITY;
};

const oncomingHorizon = (
  state: RaceState,
  rider: RiderState,
  laneX: number
): number => {
  if (Math.abs(laneX - rider.x) < OWN_LANE_REACH) {
    return ONCOMING_SECONDS;
  }
  return state.tick < START_TICKS
    ? START_ONCOMING_ENTRY_SECONDS
    : ONCOMING_ENTRY_SECONDS;
};

const riderObstacle = (other: RiderState): Obstacle => ({
  halfLength: 1,
  s: other.mode === "riding" ? other.s : other.bodyS,
  speed: other.mode === "riding" ? other.speed : 0,
  x: other.mode === "riding" ? other.x : other.bodyX,
});

const sooner = (
  first: Threat | undefined,
  second: Threat | undefined
): Threat | undefined =>
  first && (!second || first.seconds <= second.seconds) ? first : second;

export const carThreat = (
  state: RaceState,
  rider: RiderState,
  laneX: number,
  within: number
): Threat | undefined => {
  let seconds = Number.POSITIVE_INFINITY;
  let speed = 0;
  for (const car of state.cars) {
    const oncoming = car.cruiseSpeed < 0;
    if (
      (oncoming || car.s - rider.s < within) &&
      Math.abs(car.x - laneX) < LANE_REACH &&
      rider.speed > car.speed
    ) {
      const horizon = oncoming
        ? oncomingHorizon(state, rider, laneX)
        : FOLLOW_SECONDS;
      const contact = secondsUntilContact(rider, car);
      if (contact < horizon && contact < seconds) {
        seconds = contact;
        ({ speed } = car);
      }
    }
  }
  return seconds < Number.POSITIVE_INFINITY ? { seconds, speed } : undefined;
};

const LONGEST_CAR_HORIZON = Math.max(
  FOLLOW_SECONDS,
  ONCOMING_SECONDS,
  ONCOMING_ENTRY_SECONDS,
  START_ONCOMING_ENTRY_SECONDS
);

interface Sighting extends Threat {
  readonly x: number;
}

interface CarSighting extends Sighting {
  readonly oncoming: boolean;
}

const carsInReach: CarSighting[] = [];
const ridersInReach: Sighting[] = [];

const gatherInReach = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState
): void => {
  carsInReach.length = 0;
  for (const car of state.cars) {
    if (rider.speed > car.speed) {
      const seconds = secondsUntilContact(rider, car);
      if (seconds < LONGEST_CAR_HORIZON) {
        carsInReach.push({
          oncoming: car.cruiseSpeed < 0,
          seconds,
          speed: car.speed,
          x: car.x,
        });
      }
    }
  }
  ridersInReach.length = 0;
  for (const [index, other] of state.riders.entries()) {
    if (index !== riderIndex && other.mode !== "wrecked") {
      const obstacle = riderObstacle(other);
      const seconds = secondsUntilContact(rider, obstacle);
      if (seconds < RIDER_FOLLOW_SECONDS) {
        ridersInReach.push({ seconds, speed: obstacle.speed, x: obstacle.x });
      }
    }
  }
};

const laneThreat = (
  state: RaceState,
  rider: RiderState,
  laneX: number
): Threat | undefined => {
  let seconds = Number.POSITIVE_INFINITY;
  let speed = 0;
  for (const car of carsInReach) {
    if (Math.abs(car.x - laneX) < LANE_REACH) {
      const horizon = car.oncoming
        ? oncomingHorizon(state, rider, laneX)
        : FOLLOW_SECONDS;
      if (car.seconds < horizon && car.seconds < seconds) {
        ({ seconds, speed } = car);
      }
    }
  }
  let threat: Threat | undefined =
    seconds < Number.POSITIVE_INFINITY ? { seconds, speed } : undefined;
  for (const sighting of ridersInReach) {
    if (Math.abs(sighting.x - laneX) < LANE_REACH) {
      threat = sooner(threat, sighting);
    }
  }
  return threat;
};

export interface Aim {
  readonly speed: number;
  readonly x: number;
}

const nearestLaneIndex = (lanes: readonly number[], x: number): number => {
  let nearest = 0;
  for (const [index, lane] of lanes.entries()) {
    if (Math.abs(lane - x) < Math.abs((lanes[nearest] ?? 0) - x)) {
      nearest = index;
    }
  }
  return nearest;
};

const neighbourOf = (
  lanes: readonly number[],
  sameWayCount: number,
  current: number
): number => {
  const here = lanes[current] ?? 0;
  let neighbour = current;
  for (const [index, lane] of lanes.entries()) {
    if (index === current) {
      continue;
    }
    const apart = Math.abs(lane - here);
    const nearestSoFar = Math.abs((lanes[neighbour] ?? here) - here);
    if (
      neighbour === current ||
      apart < nearestSoFar ||
      (apart === nearestSoFar && index < sameWayCount)
    ) {
      neighbour = index;
    }
  }
  return neighbour;
};

export const between = (x: number, target: number, lane: number): boolean =>
  (lane - x) * (lane - target) < 0;

const seamOf = (
  lanes: readonly number[],
  sameWayCount: number,
  current: number,
  neighbour: number
): number => {
  const middle = ((lanes[current] ?? 0) + (lanes[neighbour] ?? 0)) / 2;
  const straddlesCentre = current < sameWayCount !== neighbour < sameWayCount;
  return straddlesCentre ? middle + CENTRE_SEAM_BIAS : middle;
};

const straddlesRamp = (track: Track, rider: RiderState, x: number): boolean => {
  const jump = track.features[nextJumpFrom(track, rider.s)];
  if (!jump || jump.s - rider.s > sightOf(rider)) {
    return false;
  }
  const across = Math.abs(x - jump.x);
  return (
    across > jump.width / 2 - BIKE_HALF_WIDTH &&
    across < jump.width / 2 + JUMP_WALL_CLEARANCE
  );
};

const passable = (rider: RiderState, car: TrafficCar): boolean =>
  car.cruiseSpeed >= 0 &&
  car.s > rider.s &&
  car.s - rider.s <= sightOf(rider) &&
  rider.speed > car.speed;

const offLane: number[] = [];

const offLaneLines = (
  state: RaceState,
  rider: RiderState
): readonly number[] => {
  offLane.length = 0;
  for (const index of inSight) {
    const hazard = state.hazards[index];
    if (hazard) {
      const side = Math.sign(rider.x - hazard.x) || 1;
      offLane.push(
        hazard.x + side * dodgeReach(hazard),
        hazard.x - side * dodgeReach(hazard)
      );
    }
  }
  for (const car of state.cars) {
    if (passable(rider, car)) {
      const pass = car.halfWidth + BIKE_HALF_WIDTH + PASS_MARGIN;
      offLane.push(car.x + pass, car.x - pass);
    }
  }
  if (Number.isFinite(rider.pilotLine)) {
    offLane.push(rider.pilotLine);
  }
  return offLane;
};

interface Line extends Aim {
  readonly cost: number;
}

const followLine = (
  rider: RiderState,
  lanes: readonly number[],
  threatIn: (index: number) => Threat | undefined
): Line | undefined => {
  const current = nearestLaneIndex(lanes, rider.x);
  const ahead = threatIn(current);
  const lane = lanes[current];
  if (
    !ahead ||
    lane === undefined ||
    ahead.seconds * 2 * PLANNED_BRAKING < rider.speed - ahead.speed
  ) {
    return undefined;
  }
  return {
    cost: LANE_RANK_COST * current + FOLLOW_COST,
    speed: Math.max(0, ahead.speed),
    x: lane,
  };
};

const choice = {
  cost: Number.POSITIVE_INFINITY,
  slickMetres: Number.POSITIVE_INFINITY,
  slickSpeed: Number.POSITIVE_INFINITY,
  speed: 0,
  x: 0,
};

export const chooseLine = (
  history: PilotHistory,
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  cruise: number,
  pursuit?: Aim
): Aim => {
  const { oncomingLanes, sameWayLanes } = track;
  const lanes = [...sameWayLanes, ...oncomingLanes];
  const threats: (Threat | undefined)[] = [];
  const checked: boolean[] = [];
  const threatIn = (index: number): Threat | undefined => {
    if (checked[index] !== true) {
      checked[index] = true;
      threats[index] = laneThreat(state, rider, lanes[index] ?? 0);
    }
    return threats[index];
  };
  const crossesBlocked = (target: number): boolean =>
    lanes.some((lane, index) => {
      if (
        !between(rider.x, target, lane) ||
        Math.abs(lane - rider.x) < OWN_LANE_REACH
      ) {
        return false;
      }
      const crossed = threatIn(index);
      return crossed !== undefined && crossed.seconds < CROSSING_SECONDS;
    });
  gatherInReach(state, riderIndex, rider);
  gatherInSight(state, rider);
  const kept = rider.pilotLine;
  const weighing = inSight.length > 0 || Number.isFinite(kept);
  const room = track.roadHalfWidth - BIKE_HALF_WIDTH - DODGE_EDGE;
  choice.cost = Number.POSITIVE_INFINITY;
  if (weighing) {
    measureDeceleration(track, rider);
    planForecast(history, track, rider);
    gatherObstructions(state, track, rider);
    measureHorizons();
    planCourse(history, track, rider);
  }
  const offer = (
    x: number,
    speed: number,
    cost: number,
    braking: boolean
  ): void => {
    let total = cost + MOVE_COST * Math.abs(x - rider.x);
    let lineSpeed = speed;
    toll.slickMetres = Number.POSITIVE_INFINITY;
    toll.slickSpeed = Number.POSITIVE_INFINITY;
    if (weighing) {
      weigh(history, track, rider, x, braking);
      total += toll.cost;
      lineSpeed = Math.min(
        speed,
        toll.speed,
        toll.rock ? ROCK_THROUGH_SPEED : Number.POSITIVE_INFINITY
      );
      if (Math.abs(x - kept) < LINE_MATCH) {
        total -= HYSTERESIS;
      }
    }
    if (total < choice.cost) {
      choice.cost = total;
      choice.slickMetres = toll.slickMetres;
      choice.slickSpeed = toll.slickSpeed;
      choice.speed = lineSpeed;
      choice.x = x;
    }
  };
  const offerBetweenLanes = (x: number): void => {
    if (
      Math.abs(x) <= room &&
      !straddlesRamp(track, rider, x) &&
      !laneThreat(state, rider, x) &&
      !crossesBlocked(x)
    ) {
      offer(
        x,
        cruise,
        LANE_RANK_COST * nearestLaneIndex(lanes, x) + OFF_LANE_COST,
        false
      );
    }
  };
  if (pursuit) {
    offer(pursuit.x, pursuit.speed, PURSUIT_COST, false);
  }
  for (const [index, lane] of lanes.entries()) {
    if (!threatIn(index) && !crossesBlocked(lane)) {
      offer(lane, cruise, LANE_RANK_COST * index, false);
    }
  }
  if (weighing) {
    const follow = followLine(rider, lanes, threatIn);
    if (follow) {
      offer(follow.x, follow.speed, follow.cost, true);
    }
    for (const x of offLaneLines(state, rider)) {
      offerBetweenLanes(x);
    }
  }
  if (choice.cost < Number.POSITIVE_INFINITY) {
    const stays = Math.abs(choice.x - kept) < LINE_MATCH;
    rider.pilotLine = inSight.length > 0 || stays ? choice.x : Number.NaN;
    slickAhead.metres = choice.slickMetres;
    slickAhead.speed = choice.slickSpeed;
    return { speed: choice.speed, x: choice.x };
  }
  rider.pilotLine = Number.NaN;
  const current = nearestLaneIndex(lanes, rider.x);
  const neighbour = neighbourOf(lanes, sameWayLanes.length, current);
  const pace = threats[neighbour < sameWayLanes.length ? neighbour : current];
  return {
    speed: Math.min(cruise, Math.max(0, pace?.speed ?? 0) + SPLITTING_SPEED),
    x: seamOf(lanes, sameWayLanes.length, current, neighbour),
  };
};
