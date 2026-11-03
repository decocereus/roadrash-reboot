import { heightAt, slopeAt, slopeRateAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import {
  clearsDecks,
  climbOffLip,
  frontOf,
  lipOf,
  passingLineOf,
  RAMP_RISE,
  ridingOver,
  toeOf,
} from "./carrier.ts";
import { canBrakeAfterLanding, landsOnRoad, riding } from "./pilot-corners.ts";
import { LANE_REACH } from "./pilot-lines.ts";
import type { Aim } from "./pilot-lines.ts";
import { HARD_LANDING } from "./rider-flight.ts";
import { GRAVITY, sidewaysRate } from "./state.ts";
import type { RaceState, RiderState, TrafficCar } from "./state.ts";

const JUDGE_SECONDS = 3;
const MISJUDGE_SHARE = 0.8;
const FLIGHT_STEP = 0.05;
const LONGEST_FLIGHT = 4;
const LANDING_ROOM_BEHIND = 15;
const LANDING_ROOM_SECONDS = 1;
const STRAIGHTEN_SECONDS = 0.6;
const STRAIGHTEN_SCAN_STEP = 2;

const flight = { impact: 0, seconds: 0 };

const forecastFlight = (
  track: Track,
  lip: number,
  speed: number,
  climb: number
): void => {
  const rise = climb + slopeAt(track, lip) * speed;
  const from = heightAt(track, lip) + RAMP_RISE;
  let above = RAMP_RISE;
  flight.impact = Number.NEGATIVE_INFINITY;
  flight.seconds = LONGEST_FLIGHT;
  for (let at = FLIGHT_STEP; at < LONGEST_FLIGHT; at += FLIGHT_STEP) {
    const clearance =
      from +
      rise * at -
      (GRAVITY * at * at) / 2 -
      heightAt(track, lip + speed * at);
    if (clearance <= 0) {
      const seconds = at - (FLIGHT_STEP * clearance) / (clearance - above);
      flight.seconds = seconds;
      flight.impact =
        rise -
        GRAVITY * seconds -
        slopeAt(track, lip + speed * seconds) * speed;
      return;
    }
    above = clearance;
  }
};

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

const jumpWorks = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  carrier: TrafficCar
): boolean => {
  const { speed } = rider;
  if (!clearsDecks(speed, carrier.speed)) {
    return false;
  }
  const toLip = (lipOf(carrier) - rider.s) / (speed - carrier.speed);
  const lip = rider.s + speed * toLip;
  forecastFlight(track, lip, speed, climbOffLip(speed, carrier.speed));
  const carried = speed * flight.seconds;
  return (
    flight.impact >= HARD_LANDING &&
    landsOnRoad(track, rider, lip, carried, carrier.x, speed, riding.margin) &&
    canBrakeAfterLanding(track, rider, lip + carried, speed, riding.margin) &&
    !carInTheWay(state, rider, carrier, lip + carried, toLip + flight.seconds)
  );
};

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
        rider.jumpTaken = misjudges || jumpWorks(state, track, rider, car);
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
