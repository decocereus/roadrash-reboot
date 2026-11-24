import { roadHalfWidthAt, vergeHalfWidthAt } from "@racer/track/districts";
import { hypot2 } from "@racer/track/math";
import {
  curvatureAt,
  heightAt,
  slopeAt,
  slopeRateAt,
} from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { streetBike } from "./bikes.ts";
import {
  comesDownOnDeck,
  launchOffLip,
  lipAt,
  onRampLine,
  underDeck,
} from "./carrier.ts";
import { dragOf, stepDrive } from "./engine.ts";
import { bumpBike, keptAfterBump, knockSideOf, upsetOf } from "./hazards.ts";
import type { BikeBump } from "./hazards.ts";
import {
  CRASHING_LANDING,
  forwardRateAt,
  HARD_LANDING,
  judgedFlight,
  LANDING_SLIP,
  landingCrashes,
  landingSlipOf,
  settleTouchdown,
  stepFlight,
  touchdown,
} from "./rider-flight.ts";
import {
  clamp,
  curvePushOf,
  GRAVITY,
  holdingSpeed,
  lateralSpeedLimit,
  TICK_RATE,
  TICK_SECONDS,
} from "./state.ts";
import type { BikeSpec, RiderState, TrafficCar } from "./state.ts";

const LONGEST_FLIGHT_TICKS = 4 * TICK_RATE;
const JUMP_LANDING_ROOM = 0.5;
const BUMP_LANDING_SHARE = 0.85;
const LANDING_SEARCH_STEPS = 8;
const NO_DECK = Number.POSITIVE_INFINITY;
const DECK_ROOM = 0.3;
const SCREEN_TICKS = 4;
const SCREEN_ROOM = 0.3;
const SCREEN_SLIP = 0.05;
const SCREEN_IMPACT = 4;
const SCREEN_REACH = 4;

const flight = {
  air: 0,
  airTicks: 0,
  airborne: false,
  bike: streetBike,
  lateralSpeed: 0,
  s: 0,
  speed: 0,
  verticalSpeed: 0,
  x: 0,
};

const drive = { gear: 1, revs: 0, shiftTicks: 0 };

export const landed = { s: 0, seconds: 0, speed: 0 };

const holdingLine = (
  bike: BikeSpec,
  curvature: number,
  speed: number
): number => {
  const lock = lateralSpeedLimit(bike, speed);
  return clamp(curvePushOf(bike, curvature, speed), -lock, lock);
};

const startFlight = (
  rider: RiderState,
  s: number,
  x: number,
  speed: number,
  lateralSpeed: number
): void => {
  flight.air = 0;
  flight.airTicks = 0;
  flight.bike = rider.bike;
  flight.lateralSpeed = lateralSpeed;
  flight.s = s;
  flight.speed = speed;
  flight.verticalSpeed = 0;
  flight.x = x;
};

const comesDownRiding = (
  track: Track,
  deckS: number,
  deckX: number,
  deckSpeed: number
): boolean => {
  let carS = deckS;
  touchdown.ground = heightAt(track, flight.s);
  for (let tick = 0; tick < LONGEST_FLIGHT_TICKS; tick += 1) {
    carS += deckSpeed * TICK_SECONDS;
    const down = stepFlight(track, flight, touchdown.ground);
    if (Math.abs(flight.x) > vergeHalfWidthAt(track, flight.s)) {
      return false;
    }
    if (down) {
      landed.s = touchdown.s;
      landed.seconds = flight.airTicks * TICK_SECONDS;
      if (judgedFlight(flight)) {
        settleTouchdown(track, flight);
      }
      return (
        !landingCrashes(flight) &&
        !underDeck(carS, deckX, flight.s, flight.x, DECK_ROOM)
      );
    }
    if (comesDownOnDeck(carS, deckX, flight, DECK_ROOM)) {
      return false;
    }
  }
  return false;
};

const settles = (track: Track, margin: number): boolean =>
  !judgedFlight(flight) ||
  (touchdown.slip <= LANDING_SLIP * margin &&
    Math.abs(touchdown.x) <=
      roadHalfWidthAt(track, touchdown.s) - JUMP_LANDING_ROOM);

const fastestPull = (
  track: Track,
  bike: BikeSpec,
  s: number,
  speed: number
): number => {
  const slope = slopeAt(track, s);
  return (
    Math.min(bike.launchAcceleration, stepDrive(bike, drive, speed, 1)) -
    dragOf(bike, speed, 1) -
    (GRAVITY * slope) / hypot2(1, slope)
  );
};

export const landsOffLip = (
  track: Track,
  rider: RiderState,
  carrier: TrafficCar,
  margin: number,
  ceiling: number
): boolean => {
  const { bike } = rider;
  let { s, speed, x } = rider;
  let carS = carrier.s;
  let lateralSpeed = 0;
  let ticks = 0;
  drive.gear = rider.gear;
  drive.revs = rider.revs;
  drive.shiftTicks = rider.shiftTicks;
  while (s <= lipAt(carS)) {
    if (ticks >= LONGEST_FLIGHT_TICKS || !onRampLine(carrier.x, x)) {
      return false;
    }
    ticks += 1;
    carS += carrier.speed * TICK_SECONDS;
    const curvature = curvatureAt(track, s);
    if (speed < ceiling) {
      speed = Math.min(
        speed + fastestPull(track, bike, s, speed) * TICK_SECONDS,
        ceiling,
        Math.max(speed, holdingSpeed(bike, Math.abs(curvature), 1) * margin)
      );
    }
    const push = curvePushOf(bike, curvature, speed);
    const lock = lateralSpeedLimit(bike, speed);
    lateralSpeed = clamp(push, -lock, lock);
    const rate = forwardRateAt(speed, curvature, x);
    x += (lateralSpeed - push) * TICK_SECONDS;
    s += rate * TICK_SECONDS;
  }
  landed.speed = speed;
  startFlight(rider, s, x, speed, lateralSpeed);
  launchOffLip(track, flight, carrier.speed);
  const down =
    comesDownRiding(track, carS, carrier.x, carrier.speed) &&
    touchdown.impact >= HARD_LANDING &&
    settles(track, margin);
  landed.seconds += ticks * TICK_SECONDS;
  return down;
};

const clearlyLandsOverCrest = (
  track: Track,
  bike: BikeSpec,
  from: number,
  across: number,
  speed: number,
  lateralSpeed: number,
  margin: number
): boolean => {
  const step = SCREEN_TICKS * TICK_SECONDS;
  let s = from;
  let x = across;
  let ground = heightAt(track, s);
  let curvature = curvatureAt(track, s);
  let rate = forwardRateAt(speed, curvature, x);
  let rise = slopeAt(track, s) * rate;
  let air = 0;
  for (let tick = 0; tick < LONGEST_FLIGHT_TICKS; tick += SCREEN_TICKS) {
    x += (lateralSpeed - curvePushOf(bike, curvature, speed)) * step;
    s += rate * step;
    const height = heightAt(track, s);
    air += rise * step - (GRAVITY * step * step) / 2 - (height - ground);
    ground = height;
    rise -= GRAVITY * step;
    if (Math.abs(x) > vergeHalfWidthAt(track, s) - SCREEN_ROOM) {
      return false;
    }
    curvature = curvatureAt(track, s);
    rate = forwardRateAt(speed, curvature, x);
    if (air <= 0) {
      landed.s = s + SCREEN_REACH;
      return (
        rise - slopeAt(track, s) * rate > CRASHING_LANDING + SCREEN_IMPACT &&
        landingSlipOf(bike, lateralSpeed, curvature, speed) <=
          LANDING_SLIP * margin - SCREEN_SLIP &&
        Math.abs(x) <=
          roadHalfWidthAt(track, s) - JUMP_LANDING_ROOM - SCREEN_ROOM
      );
    }
  }
  return false;
};

export const landsOverCrest = (
  track: Track,
  rider: RiderState,
  s: number,
  x: number,
  speed: number,
  margin: number
): boolean => {
  const curvature = curvatureAt(track, s);
  const lateralSpeed = holdingLine(rider.bike, curvature, speed);
  if (
    clearlyLandsOverCrest(track, rider.bike, s, x, speed, lateralSpeed, margin)
  ) {
    return true;
  }
  startFlight(rider, s, x, speed, lateralSpeed);
  flight.verticalSpeed = slopeAt(track, s) * forwardRateAt(speed, curvature, x);
  return comesDownRiding(track, 0, NO_DECK, 0) && settles(track, margin);
};

const bumpSettles = (
  track: Track,
  bike: BikeSpec,
  x: number,
  drift: number,
  blow: BikeBump,
  hazardX: number,
  from: number,
  bend: number,
  bow: number,
  speed: number
): boolean => {
  const lock = lateralSpeedLimit(bike, speed);
  const before = clamp(drift + curvePushOf(bike, bend, speed), -lock, lock);
  const lateral =
    before + knockSideOf(before, x, hazardX) * upsetOf(bike, blow, speed);
  const after = speed * keptAfterBump(blow, speed);
  const rate = forwardRateAt(after, bend, x);
  const settle = GRAVITY + bow * rate * rate;
  if (settle <= 0) {
    return false;
  }
  const seconds = (2 * blow.kick * speed) / settle;
  const down = from + rate * seconds;
  const landingBend = curvatureAt(track, down);
  const drifted =
    x +
    (lateral -
      (curvePushOf(bike, bend, after) + curvePushOf(bike, landingBend, after)) /
        2) *
      seconds;
  return (
    landingSlipOf(bike, lateral, landingBend, after) <=
      LANDING_SLIP * BUMP_LANDING_SHARE &&
    Math.abs(drifted) <= roadHalfWidthAt(track, down) - JUMP_LANDING_ROOM
  );
};

const ridesOverBump = (
  track: Track,
  rider: RiderState,
  from: number,
  x: number,
  drift: number,
  blow: BikeBump,
  hazardX: number,
  speed: number
): boolean => {
  const lock = lateralSpeedLimit(rider.bike, speed);
  startFlight(
    rider,
    from,
    x,
    speed,
    clamp(
      drift + curvePushOf(rider.bike, curvatureAt(track, from), speed),
      -lock,
      lock
    )
  );
  bumpBike(track, flight, hazardX, blow);
  return (
    comesDownRiding(track, 0, NO_DECK, 0) && settles(track, BUMP_LANDING_SHARE)
  );
};

export const bumpLandingSpeed = (
  track: Track,
  rider: RiderState,
  from: number,
  x: number,
  drift: number,
  blow: BikeBump,
  hazardX: number
): number => {
  const { bike, speed } = rider;
  const bend = curvatureAt(track, from);
  const bow = slopeRateAt(track, from);
  const screened = bumpSettles(
    track,
    bike,
    x,
    drift,
    blow,
    hazardX,
    from,
    bend,
    bow,
    speed
  );
  if (
    screened &&
    ridesOverBump(track, rider, from, x, drift, blow, hazardX, speed)
  ) {
    return speed;
  }
  let low = 0;
  let high = speed;
  for (let step = 0; step < LANDING_SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (
      bumpSettles(
        track,
        bike,
        x,
        drift,
        blow,
        hazardX,
        from,
        bend,
        bow,
        middle
      ) &&
      (!screened ||
        ridesOverBump(track, rider, from, x, drift, blow, hazardX, middle))
    ) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
};
