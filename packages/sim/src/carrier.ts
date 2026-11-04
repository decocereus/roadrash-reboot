import { slopeAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { glancesOff } from "./rider-collisions.ts";
import { throwRider } from "./rider-crash.ts";
import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  GRAVITY,
  TICK_SECONDS,
} from "./state.ts";
import type { CarBox, RaceState, RiderState, TrafficCar } from "./state.ts";

const RIG_HALF_LENGTH = 14.35;
const BODY_LENGTH = 16.4;
const LIP_GAP = 1.6;
const RAMP_LENGTH = 10.7;
export const RAMP_RISE = 4.3;
const RAMP_HALF_WIDTH = 1.2;
const RAMP_SLOPE = RAMP_RISE / RAMP_LENGTH;
const MOST_CLIMB = 6;
const DECK_STEP = 0.1;
const CARRIER_SPEED = 20;
const CARRIER_HALF_WIDTH = 1.25;
const CARRIER_HEIGHT = 4.22;
const CLEAR_OF_TRAFFIC = 30;
const PASS_MARGIN = 0.15;
const SAME_LINE = 0.05;

export const frontOf = (car: TrafficCar): number => car.s + RIG_HALF_LENGTH;
export const lipOf = (car: TrafficCar): number =>
  frontOf(car) - BODY_LENGTH - LIP_GAP;
export const toeOf = (car: TrafficCar): number => lipOf(car) - RAMP_LENGTH;
const heightOn = (car: TrafficCar, s: number): number =>
  (s - toeOf(car)) * RAMP_SLOPE;
const onFootprint = (car: TrafficCar, s: number, x: number): boolean =>
  s >= toeOf(car) && s <= lipOf(car) && Math.abs(x - car.x) <= RAMP_HALF_WIDTH;

const carrierBody = {
  halfLength: BODY_LENGTH / 2,
  halfWidth: CARRIER_HALF_WIDTH,
  height: CARRIER_HEIGHT,
  s: 0,
  speed: 0,
  x: 0,
};

export const comesDownOnCarrier = (
  state: RaceState,
  rider: RiderState,
  car: TrafficCar
): boolean => {
  if (
    !car.carrier ||
    rider.air <= 0 ||
    rider.air >= CARRIER_HEIGHT ||
    rider.onCarrier >= 0 ||
    Math.abs(rider.x - car.x) >= CARRIER_HALF_WIDTH + BIKE_HALF_WIDTH
  ) {
    return false;
  }
  const body = frontOf(car) - BODY_LENGTH / 2;
  if (Math.abs(rider.s - body) >= BODY_LENGTH / 2 + BIKE_HALF_LENGTH) {
    return false;
  }
  throwRider(state, rider, "traffic", 0.45, 0.6);
  return true;
};

export const solidBoxOf = (car: TrafficCar): CarBox => {
  if (!car.carrier) {
    return car;
  }
  carrierBody.s = frontOf(car) - BODY_LENGTH / 2;
  carrierBody.speed = car.speed;
  carrierBody.x = car.x;
  return carrierBody;
};

export const climbOffLip = (riderSpeed: number, carSpeed: number): number =>
  Math.min(MOST_CLIMB, Math.max(0, riderSpeed - carSpeed) * RAMP_SLOPE);

export const clearsDecks = (riderSpeed: number, carSpeed: number): boolean => {
  const climb = climbOffLip(riderSpeed, carSpeed);
  const secondsAbove =
    (climb +
      Math.sqrt(climb * climb + 2 * GRAVITY * (RAMP_RISE - CARRIER_HEIGHT))) /
    GRAVITY;
  return (
    (riderSpeed - carSpeed) * secondsAbove >
    LIP_GAP + BODY_LENGTH + BIKE_HALF_LENGTH
  );
};

export const passingLineOf = (car: TrafficCar, x: number): number => {
  const clear = CARRIER_HALF_WIDTH + BIKE_HALF_WIDTH + PASS_MARGIN;
  const across = x - car.x;
  return Math.abs(across) < SAME_LINE || Math.abs(across) >= clear
    ? x
    : car.x + Math.sign(across) * clear;
};

export const ridingOver = (rider: RiderState, carIndex: number): boolean =>
  rider.jumpTaken && rider.jumpSeen === carIndex;

const launch = (track: Track, rider: RiderState, car: TrafficCar): void => {
  rider.onCarrier = -1;
  rider.airborne = true;
  rider.airTicks = 0;
  rider.air = RAMP_RISE;
  rider.verticalSpeed =
    climbOffLip(rider.speed, car.speed) + slopeAt(track, rider.s) * rider.speed;
};

const carry = (track: Track, rider: RiderState, car: TrafficCar): void => {
  if (rider.s > lipOf(car)) {
    launch(track, rider, car);
    return;
  }
  if (rider.s < toeOf(car)) {
    rider.onCarrier = -1;
    rider.air = 0;
    return;
  }
  if (Math.abs(rider.x - car.x) > RAMP_HALF_WIDTH) {
    rider.onCarrier = -1;
    rider.airborne = true;
    rider.airTicks = 0;
    rider.air = heightOn(car, rider.s);
    rider.verticalSpeed = 0;
    return;
  }
  rider.airborne = false;
  rider.verticalSpeed = 0;
  rider.air = heightOn(car, rider.s);
};

const meetRamp = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  index: number,
  car: TrafficCar,
  fromS: number,
  fromX: number
): void => {
  const height = heightOn(car, rider.s);
  const camePastToe = fromS <= toeOf(car) - car.speed * TICK_SECONDS;
  if (!camePastToe && rider.air + DECK_STEP < height) {
    if (glancesOff(state, rider, height, fromX) && !rider.airborne) {
      rider.air = 0;
    }
    return;
  }
  if (rider.airborne && rider.air > height + DECK_STEP) {
    return;
  }
  rider.onCarrier = index;
  carry(track, rider, car);
};

export const stepCarrierRamp = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  fromS: number,
  fromX: number
): void => {
  const carried = state.cars[rider.onCarrier];
  if (carried) {
    carry(track, rider, carried);
    return;
  }
  const { cars } = state;
  const first = cars.length - track.carrierStarts.length;
  for (let index = first; index < cars.length; index += 1) {
    const car = cars[index];
    if (car?.carrier === true && onFootprint(car, rider.s, rider.x)) {
      meetRamp(state, track, rider, index, car, fromS, fromX);
      return;
    }
  }
};

const rigBody = {
  halfLength: RIG_HALF_LENGTH,
  halfWidth: CARRIER_HALF_WIDTH,
  height: CARRIER_HEIGHT,
};

export const carrierAt = (
  s: number,
  x: number,
  paint: number,
  patience: number
): TrafficCar => ({
  ...rigBody,
  carrier: true,
  cruiseSpeed: CARRIER_SPEED,
  home: x,
  paint,
  patience,
  s,
  speed: CARRIER_SPEED,
  waited: 0,
  x,
});

export const clearOfCarrier = (
  car: TrafficCar,
  s: number,
  x: number
): boolean => Math.abs(car.s - s) > CLEAR_OF_TRAFFIC || Math.abs(car.x - x) > 1;
