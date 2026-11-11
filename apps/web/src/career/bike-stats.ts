import { launchSecondsOf, topSpeedOf } from "@racer/sim/engine";
import type { BikeSpec } from "@racer/sim/state";

export interface BikeStat {
  readonly label: string;
  readonly value: number;
}

const KMH = 3.6;
const FASTEST = 290 / KMH;
const SLOWEST_LAUNCH = 8;
const QUICKEST_LAUNCH = 2.5;
const BEST_RESPONSE = 8.8;
const BEST_SIDESTEP = 5.7;
const BEST_GRIP = 3;
const BEST_BRAKES = 30;

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

export const topSpeedKmh = (bike: BikeSpec): number =>
  Math.round(topSpeedOf(bike) * KMH);

export const bikeStats = (bike: BikeSpec): readonly BikeStat[] => {
  const shown = measure(bike);
  return [
    { label: "Top speed", value: shown.topSpeed },
    { label: "Launch", value: shown.launch },
    { label: "Steering", value: shown.steering },
    { label: "Bend grip", value: shown.grip },
    { label: "Brakes", value: shown.brakes },
  ];
};
