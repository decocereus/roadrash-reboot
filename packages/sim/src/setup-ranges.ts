import { riderPalette } from "./palette.ts";
import type { BikeSpec, RaceSetup, RiderProfile } from "./state.ts";

export interface OutOfRange {
  readonly kind: "outOfRange";
  readonly rule: string;
  readonly value: number;
}

type Range<Source> = readonly [
  name: string,
  least: number,
  most: number,
  read: (source: Source) => number,
];

const rangesOutside = <Source>(
  ranges: readonly Range<Source>[],
  source: Source,
  prefix: string
): readonly OutOfRange[] =>
  ranges.flatMap(([name, least, most, read]) => {
    const value = read(source);
    return value >= least && value <= most
      ? []
      : [{ kind: "outOfRange", rule: `${prefix}${name}`, value } as const];
  });

const ruleRanges: readonly Range<RaceSetup>[] = [
  ["hazardShare", 0, 1, (setup) => setup.conditions.hazardShare],
  ["hitDamage", 0, 10, (setup) => setup.conditions.hitDamage],
  ["slowConvoys", 0, 4, (setup) => setup.conditions.slowConvoys],
  ["trafficDensity", 0, 3, (setup) => setup.conditions.trafficDensity],
  ["catchUp", 0, 1, (setup) => setup.pacing.catchUp],
  ["leadEase", 0, 1, (setup) => setup.pacing.leadEase],
  ["police.beat", 0, 20_000, (setup) => setup.police.beat],
  ["police.count", 0, 8, (setup) => setup.police.count],
  ["police.fine", 0, 100_000, (setup) => setup.police.fine],
  ["police.loseRange", 0, 1000, (setup) => setup.police.loseRange],
  ["police.sightRange", 0, 1000, (setup) => setup.police.sightRange],
  ["police.topSpeed", 0, 150, (setup) => setup.police.topSpeed],
];

const bikeRanges: readonly Range<BikeSpec>[] = [
  ["brakeDeceleration", 1, 60, (bike) => bike.brakeDeceleration],
  ["curvePush", 0.1, 10, (bike) => bike.curvePush],
  ["dragFactor", 0, 0.01, (bike) => bike.dragFactor],
  ["engineBraking", 0, 20, (bike) => bike.engineBraking],
  ["lateralSpeed", 0.5, 20, (bike) => bike.lateralSpeed],
  ["lateralSpeedPerSpeed", 0, 0.2, (bike) => bike.lateralSpeedPerSpeed],
  ["launchAcceleration", 1, 40, (bike) => bike.launchAcceleration],
  ["leanScrub", 0, 1, (bike) => bike.leanScrub],
  ["powerPerMass", 10, 2000, (bike) => bike.powerPerMass],
  ["price", 0, 1_000_000, (bike) => bike.price],
  ["rollingDeceleration", 0, 5, (bike) => bike.rollingDeceleration],
  ["steerRate", 0.5, 30, (bike) => bike.steerRate],
  ["visualLean", 0, 1.2, (bike) => bike.visualLean],
];

const LAST_COLOUR = riderPalette.length - 1;

const riderRanges: readonly Range<RiderProfile>[] = [
  ["aggression", 0, 1, (rider) => rider.aggression],
  ["jacket", 0, LAST_COLOUR, (rider) => rider.jacket],
  ["paint", 0, LAST_COLOUR, (rider) => rider.paint],
  ["skill", 0, 1, (rider) => rider.skill],
];

const MOST_GEAR_SPEED = 150;

const gearsOutOfOrder = (bike: BikeSpec): readonly OutOfRange[] =>
  bike.gears.flatMap((speed, gear) => {
    const below = gear === 0 ? 0 : (bike.gears[gear - 1] ?? 0);
    return speed > below && speed <= MOST_GEAR_SPEED
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
    ...entrants.flatMap((rider) =>
      rangesOutside(riderRanges, rider, `${rider.name}.`)
    ),
    ...[...bikes].flatMap(bikeOutOfRange),
  ];
};
