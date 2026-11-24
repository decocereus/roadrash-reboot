import { slopeRateAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import {
  frontOf,
  jumpClears,
  passingLineOf,
  ridingOver,
  toeOf,
} from "./carrier.ts";
import { canBrakeAfterLanding, riding } from "./pilot-corners.ts";
import { landed, landsOffLip } from "./pilot-landing.ts";
import type { Aim } from "./pilot-lines.ts";
import { GRAVITY, LANE_REACH, sidewaysRate } from "./state.ts";
import type { RaceState, RiderState, TrafficCar } from "./state.ts";

const JUDGE_SECONDS = 3;
const MISJUDGE_SHARE = 0.8;
const LANDING_ROOM_BEHIND = 15;
const LANDING_ROOM_SECONDS = 1;
const STRAIGHTEN_SECONDS = 0.6;
const STRAIGHTEN_SCAN_STEP = 2;

const carInTheWay = (
  state: RaceState,
  rider: RiderState,
  carrier: TrafficCar,
  landing: number,
  seconds: number
): boolean => {
  const toe = toeOf(carrier);
  const landingFrom = landing - LANDING_ROOM_BEHIND;
  const landingTo = landing + rider.speed * LANDING_ROOM_SECONDS;
  for (const car of state.cars) {
    if (car !== carrier && Math.abs(car.x - carrier.x) < LANE_REACH) {
      const reach = car.halfLength;
      const down = car.s + car.speed * seconds;
      if (
        (car.s + reach > rider.s && car.s - reach < toe) ||
        (down + reach > landingFrom && down - reach < landingTo)
      ) {
        return true;
      }
    }
  }
  return false;
};

const landsArriving = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  carrier: TrafficCar,
  ceiling: number
): boolean =>
  landsOffLip(track, rider, carrier, riding.margin, ceiling) &&
  canBrakeAfterLanding(track, rider, landed.s, landed.speed, riding.margin) &&
  !carInTheWay(state, rider, carrier, landed.s, landed.seconds);

const jumpWorks = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  carrier: TrafficCar,
  wanted: number
): boolean =>
  landsArriving(state, track, rider, carrier, rider.speed) &&
  (wanted <= rider.speed ||
    landsArriving(state, track, rider, carrier, wanted));

const inJudgingRange = (rider: RiderState, car: TrafficCar): boolean => {
  const toToe = toeOf(car) - rider.s;
  return (
    toToe > 0 &&
    rider.speed > car.speed &&
    toToe < (rider.speed - car.speed) * JUDGE_SECONDS
  );
};

const stillMeeting = (rider: RiderState, car: TrafficCar): boolean =>
  rider.s <= frontOf(car) &&
  (rider.s >= toeOf(car) || inJudgingRange(rider, car));

const missedTheRamp = (rider: RiderState, car: TrafficCar): boolean =>
  rider.s > toeOf(car) && rider.onCarrier < 0 && !rider.airborne;

const hidesTraffic = (
  cars: readonly TrafficCar[],
  rider: RiderState
): boolean => {
  for (let index = 0; index < cars.length; index += 1) {
    if (index !== rider.jumpSeen && jumpClears(cars, rider, index)) {
      return true;
    }
  }
  return false;
};

const stillJumping = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  car: TrafficCar
): boolean =>
  rider.airborne ||
  rider.s >= toeOf(car) ||
  !hidesTraffic(state.cars, rider) ||
  landsArriving(state, track, rider, car, rider.speed);

export const jumpAim = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  aim: Aim,
  roll: (state: RaceState) => number
): Aim => {
  const met = state.cars[rider.jumpSeen];
  if (met && !stillMeeting(rider, met)) {
    rider.jumpSeen = -1;
    rider.jumpTaken = false;
  } else if (met && missedTheRamp(rider, met)) {
    rider.jumpTaken = false;
  }
  let { x } = aim;
  const { cars } = state;
  const first = cars.length - track.carrierStarts.length;
  for (let index = first; index < cars.length; index += 1) {
    const car = cars[index];
    if (car?.carrier === true && stillMeeting(rider, car)) {
      if (
        rider.jumpSeen < 0 &&
        Math.abs(rider.x - car.x) < LANE_REACH &&
        inJudgingRange(rider, car)
      ) {
        const misjudges =
          roll(state) < (1 - rider.profile.skill) * MISJUDGE_SHARE;
        rider.jumpSeen = index;
        rider.jumpTaken =
          misjudges || jumpWorks(state, track, rider, car, aim.speed);
      } else if (
        ridingOver(rider, index) &&
        !stillJumping(state, track, rider, car)
      ) {
        rider.jumpTaken = false;
      }
      x = ridingOver(rider, index) ? car.x : passingLineOf(car, x);
    }
  }
  return x === aim.x ? aim : { speed: aim.speed, x };
};

const launchesSoon = (track: Track, rider: RiderState): boolean => {
  const reach = rider.speed * STRAIGHTEN_SECONDS;
  const lift = -GRAVITY / (rider.speed * rider.speed);
  for (let ahead = 0; ahead <= reach; ahead += STRAIGHTEN_SCAN_STEP) {
    if (slopeRateAt(track, rider.s + ahead) < lift) {
      return true;
    }
  }
  return false;
};

export const straightened = (
  track: Track,
  rider: RiderState,
  aim: Aim
): Aim => {
  if (rider.speed <= 0 || !launchesSoon(track, rider)) {
    return aim;
  }
  const settling =
    (rider.lateralSpeed * Math.abs(rider.lateralSpeed)) /
    (2 * sidewaysRate(rider.bike, rider.lateralSpeed, 0, 0));
  return { speed: aim.speed, x: rider.x + settling };
};
