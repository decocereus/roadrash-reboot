import { TICK_SECONDS } from "@racer/sim/state";
import type { BikeSpec } from "@racer/sim/state";
import type { BikeStat } from "@racer/ui/components/bike-card";

const KMH = 3.6;
const HUNDRED_KMH = 100 / KMH;
const FASTEST = 230 / KMH;
const SLOWEST_LAUNCH = 10;
const QUICKEST_LAUNCH = 4;
const BEST_RESPONSE = 6.5;
const BEST_SIDESTEP = 4.2;
const BEST_GRIP = 2.3;
const BEST_BRAKES = 30;
const SEARCH_STEPS = 40;
const LAUNCH_LIMIT = 30;

const pull = (bike: BikeSpec, speed: number): number =>
  Math.min(bike.launchAcceleration, bike.powerPerMass / Math.max(speed, 1)) -
  bike.dragFactor * speed * speed -
  bike.rollingDeceleration;

export const topSpeedOf = (bike: BikeSpec): number => {
  let slow = 1;
  let fast = 150;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const middle = (slow + fast) / 2;
    if (pull(bike, middle) > 0) {
      slow = middle;
    } else {
      fast = middle;
    }
  }
  return slow;
};

export const launchSecondsOf = (bike: BikeSpec): number => {
  let speed = 0;
  let seconds = 0;
  while (speed < HUNDRED_KMH && seconds < LAUNCH_LIMIT) {
    speed += pull(bike, speed) * TICK_SECONDS;
    seconds += TICK_SECONDS;
  }
  return seconds;
};

interface Measures {
  readonly topSpeed: number;
  readonly launch: number;
  readonly steering: number;
  readonly grip: number;
  readonly brakes: number;
}

const measure = (bike: BikeSpec): Measures => ({
  brakes: bike.brakeDeceleration / BEST_BRAKES,
  grip: bike.curvePush / BEST_GRIP,
  launch:
    (SLOWEST_LAUNCH - launchSecondsOf(bike)) /
    (SLOWEST_LAUNCH - QUICKEST_LAUNCH),
  steering:
    (bike.steerRate / BEST_RESPONSE + bike.lateralSpeed / BEST_SIDESTEP) / 2,
  topSpeed: topSpeedOf(bike) / FASTEST,
});

export const bikeStats = (
  bike: BikeSpec,
  owned: BikeSpec
): readonly BikeStat[] => {
  const shown = measure(bike);
  const mine = measure(owned);
  const same = bike.id === owned.id;
  const baseline = (value: number): number | undefined =>
    same ? undefined : value;
  return [
    {
      baseline: baseline(mine.topSpeed),
      label: "Top speed",
      reading: `${Math.round(topSpeedOf(bike) * KMH)} km/h`,
      value: shown.topSpeed,
    },
    {
      baseline: baseline(mine.launch),
      label: "Launch",
      reading: `${launchSecondsOf(bike).toFixed(1)} s`,
      value: shown.launch,
    },
    {
      baseline: baseline(mine.steering),
      label: "Steering",
      value: shown.steering,
    },
    { baseline: baseline(mine.grip), label: "Bend grip", value: shown.grip },
    { baseline: baseline(mine.brakes), label: "Brakes", value: shown.brakes },
  ];
};
