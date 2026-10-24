import { roadLevels } from "@racer/track/road";
import type { RoadLevel } from "@racer/track/road";

export interface RaceRules {
  readonly fieldSize: number;
  readonly levelCount: RoadLevel;
  readonly police: Readonly<Record<RoadLevel, number>>;
}

export interface Rungs {
  readonly lowest: RoadLevel;
  readonly highest: RoadLevel;
}

export const levelsOf = (rules: RaceRules): readonly RoadLevel[] =>
  roadLevels.filter((level) => level <= rules.levelCount);

export const levelAfter = (
  rules: RaceRules,
  level: RoadLevel
): RoadLevel | null =>
  levelsOf(rules).find((next) => next === level + 1) ?? null;

const TOP_RUNG = roadLevels.length;

const highestRungAt = (rules: RaceRules, level: number): number =>
  1 + Math.round(((level - 1) * (TOP_RUNG - 1)) / (rules.levelCount - 1));

const rungNumbered = (value: number): RoadLevel => {
  const rung = roadLevels.find((each) => each === value);
  if (rung === undefined) {
    throw new Error(`The career tables have no rung ${value}.`);
  }
  return rung;
};

export const rungsOf = (rules: RaceRules, level: RoadLevel): Rungs => ({
  highest: rungNumbered(highestRungAt(rules, level)),
  lowest: rungNumbered(Math.max(1, highestRungAt(rules, level - 1) + 1)),
});

export const climbOf = (rules: RaceRules, level: RoadLevel): number => {
  const next = levelAfter(rules, level);
  return next === null
    ? highestRungAt(rules, level) - highestRungAt(rules, level - 1)
    : highestRungAt(rules, next) - highestRungAt(rules, level);
};

export const rungsWithin = ({ lowest, highest }: Rungs): readonly RoadLevel[] =>
  roadLevels.filter((rung) => rung >= lowest && rung <= highest);

export const levelReaching = (rules: RaceRules, rung: RoadLevel): RoadLevel => {
  const level = levelsOf(rules).find(
    (each) => rungsOf(rules, each).highest >= rung
  );
  if (level === undefined) {
    throw new Error(`No level reaches rung ${rung}.`);
  }
  return level;
};
