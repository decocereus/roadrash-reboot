import { clamp, TICK_SECONDS } from "./state.ts";
import type { BikeSpec } from "./state.ts";

export const CONTROL_RAMP = 4;
const SHIFT_UP_REVS = 0.96;
const SHIFT_DOWN_REVS = 0.58;
const SHIFT_TICKS = 8;
const CLUTCH_REVS = 0.5;
const TUCK_DRAG_CUT = 0.14;
const TORQUE_PEAK_REVS = 0.72;
const TORQUE_FALL = 3.57;
const TORQUE_FLOOR = 0.45;
const OVER_REV = 1.05;
const SEARCH_STEPS = 48;
const LAUNCH_LIMIT_SECONDS = 30;
const HUNDRED_KMH = 100 / 3.6;

export interface Drive {
  gear: number;
  revs: number;
  shiftTicks: number;
}

const torqueAt = (revs: number): number => {
  const delta = revs - TORQUE_PEAK_REVS;
  return Math.max(TORQUE_FLOOR, 1 - TORQUE_FALL * (delta * delta));
};

const peakPower = (): number => {
  let peak = 0;
  for (let step = 0; step <= 1000; step += 1) {
    const revs = step / 1000;
    peak = Math.max(peak, revs * torqueAt(revs));
  }
  return peak;
};

const POWER_NORM = peakPower();

const gearTop = (bike: BikeSpec, gear: number): number =>
  bike.gears[gear - 1] ?? bike.gears[0];

const topGearOf = (bike: BikeSpec): number => bike.gears.length;

const gearFor = (bike: BikeSpec, gear: number, speed: number): number => {
  const revs = speed / gearTop(bike, gear);
  if (revs > SHIFT_UP_REVS && gear < bike.gears.length) {
    return gear + 1;
  }
  if (revs < SHIFT_DOWN_REVS && gear > 1) {
    return gear - 1;
  }
  return gear;
};

const thrustOf = (
  bike: BikeSpec,
  gear: number,
  speed: number,
  throttle: number
): number => {
  const top = gearTop(bike, gear);
  const revs = speed / top;
  if (revs > 1) {
    return 0;
  }
  const pulled = gear === 1 ? Math.max(revs, CLUTCH_REVS) : revs;
  return (throttle * bike.powerPerMass * torqueAt(pulled)) / (top * POWER_NORM);
};

export const stepDrive = (
  bike: BikeSpec,
  drive: Drive,
  speed: number,
  throttle: number
): number => {
  const next = gearFor(bike, drive.gear, speed);
  if (next > drive.gear) {
    drive.shiftTicks = SHIFT_TICKS;
  }
  drive.gear = next;
  const revs = speed / gearTop(bike, next);
  drive.revs = clamp(
    next === 1 && throttle > 0 ? Math.max(revs, CLUTCH_REVS) : revs,
    0,
    OVER_REV
  );
  if (drive.shiftTicks > 0) {
    drive.shiftTicks -= 1;
    return 0;
  }
  return thrustOf(bike, next, speed, throttle);
};

export const dragOf = (bike: BikeSpec, speed: number, tuck: number): number =>
  bike.dragFactor * (1 - TUCK_DRAG_CUT * tuck) * speed * speed +
  bike.rollingDeceleration;

export const topSpeedOf = (bike: BikeSpec, tucked = false): number => {
  const gear = topGearOf(bike);
  let slow = 0;
  let fast = gearTop(bike, gear);
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const middle = (slow + fast) / 2;
    if (
      thrustOf(bike, gear, middle, 1) > dragOf(bike, middle, tucked ? 1 : 0)
    ) {
      slow = middle;
    } else {
      fast = middle;
    }
  }
  return slow;
};

export const launchSecondsOf = (bike: BikeSpec): number => {
  const drive: Drive = { gear: 1, revs: 0, shiftTicks: 0 };
  let speed = 0;
  let throttle = 0;
  let seconds = 0;
  while (speed < HUNDRED_KMH && seconds < LAUNCH_LIMIT_SECONDS) {
    throttle = Math.min(1, throttle + CONTROL_RAMP * TICK_SECONDS);
    const pull = Math.min(
      bike.launchAcceleration * throttle,
      stepDrive(bike, drive, speed, throttle)
    );
    speed += (pull - dragOf(bike, speed, 0)) * TICK_SECONDS;
    seconds += TICK_SECONDS;
  }
  return seconds;
};
