import { keepsGearAfterUpshift } from "./engine.ts";
import { riderPalette } from "./palette.ts";
import type { BikeSpec, RaceSetup, RiderProfile } from "./state.ts";

export interface OutOfRange {
  readonly kind: "outOfRange";
  readonly rule: string;
  readonly value: number;
}

const rangeSteps = ["real", "integer"] as const;

type RangeStep = (typeof rangeSteps)[number];

type Range<Source> = readonly [
  name: string,
  least: number,
  most: number,
  step: RangeStep,
  read: (source: Source) => number,
];

const onStep = (value: number, step: RangeStep): boolean => {
  switch (step) {
    case "real": {
      return true;
    }
    case "integer": {
      return Number.isInteger(value);
    }
    default: {
      return step satisfies never;
    }
  }
};

const rangesOutside = <Source>(
  ranges: readonly Range<Source>[],
  source: Source,
  prefix: string
): readonly OutOfRange[] =>
  ranges.flatMap(([name, least, most, step, read]) => {
    const value = read(source);
    return value >= least && value <= most && onStep(value, step)
      ? []
      : [{ kind: "outOfRange", rule: `${prefix}${name}`, value } as const];
  });

const ruleRanges: readonly Range<RaceSetup>[] = [
  ["hazardShare", 0, 1, "real", (setup) => setup.conditions.hazardShare],
  ["hitDamage", 0, 10, "real", (setup) => setup.conditions.hitDamage],
  ["slowConvoys", 0, 4, "integer", (setup) => setup.conditions.slowConvoys],
  ["trafficDensity", 0, 3, "real", (setup) => setup.conditions.trafficDensity],
  ["catchUp", 0, 1, "real", (setup) => setup.pacing.catchUp],
  ["leadEase", 0, 1, "real", (setup) => setup.pacing.leadEase],
  ["police.beat", 0, 20_000, "real", (setup) => setup.police.beat],
  ["police.count", 0, 8, "integer", (setup) => setup.police.count],
  ["police.fine", 0, 100_000, "real", (setup) => setup.police.fine],
  ["police.loseRange", 0, 1000, "real", (setup) => setup.police.loseRange],
  ["police.sightRange", 0, 1000, "real", (setup) => setup.police.sightRange],
  ["police.topSpeed", 0, 150, "real", (setup) => setup.police.topSpeed],
];

const bikeRanges: readonly Range<BikeSpec>[] = [
  ["brakeDeceleration", 1, 60, "real", (bike) => bike.brakeDeceleration],
  ["curvePush", 0.1, 10, "real", (bike) => bike.curvePush],
  ["dragFactor", 0, 0.01, "real", (bike) => bike.dragFactor],
  ["engineBraking", 0, 20, "real", (bike) => bike.engineBraking],
  ["lateralSpeed", 0.5, 20, "real", (bike) => bike.lateralSpeed],
  ["lateralSpeedPerSpeed", 0, 0.2, "real", (bike) => bike.lateralSpeedPerSpeed],
  ["launchAcceleration", 1, 40, "real", (bike) => bike.launchAcceleration],
  ["leanScrub", 0, 1, "real", (bike) => bike.leanScrub],
  ["powerPerMass", 10, 2000, "real", (bike) => bike.powerPerMass],
  ["price", 0, 1_000_000, "real", (bike) => bike.price],
  ["rollingDeceleration", 0, 5, "real", (bike) => bike.rollingDeceleration],
  ["steerRate", 0.5, 30, "real", (bike) => bike.steerRate],
  ["visualLean", 0, 1.2, "real", (bike) => bike.visualLean],
];

const LAST_COLOUR = riderPalette.length - 1;

const riderRanges: readonly Range<RiderProfile>[] = [
  ["aggression", 0, 1, "real", (rider) => rider.aggression],
  ["jacket", 0, LAST_COLOUR, "integer", (rider) => rider.jacket],
  ["paint", 0, LAST_COLOUR, "integer", (rider) => rider.paint],
  ["skill", 0, 1, "real", (rider) => rider.skill],
];

const MOST_GEAR_SPEED = 150;

const gearsOutOfOrder = (bike: BikeSpec): readonly OutOfRange[] =>
  bike.gears.flatMap((speed, gear) => {
    const below = bike.gears[gear - 1];
    const follows =
      below === undefined
        ? speed > 0
        : speed > below && keepsGearAfterUpshift(bike, gear);
    return follows && speed <= MOST_GEAR_SPEED
      ? []
      : [
          {
            kind: "outOfRange",
            rule: `${bike.id}.gears`,
            value: speed,
          } as const,
        ];
  });

const bikeOutOfRange = (bike: BikeSpec): readonly OutOfRange[] => [
  ...rangesOutside(bikeRanges, bike, `${bike.id}.`),
  ...gearsOutOfOrder(bike),
];

export const rulesOutOfRange = (setup: RaceSetup): readonly OutOfRange[] =>
  rangesOutside(ruleRanges, setup, "");

export const entrantsOutOfRange = (setup: RaceSetup): readonly OutOfRange[] => {
  const entrants = [setup.player, ...setup.rivals];
  const bikes = new Set([...entrants, setup.police].map(({ bike }) => bike));
  return [
    ...[...entrants, setup.police.officer].flatMap((rider) =>
      rangesOutside(riderRanges, rider, `${rider.name}.`)
    ),
    ...[...bikes].flatMap(bikeOutOfRange),
  ];
};
