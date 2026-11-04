import { rungs } from "@racer/sim/cast";
import type { Rung } from "@racer/sim/cast";

export interface RaceRules {
  readonly celebrities: boolean;
  readonly fieldSize: number;
  readonly levelCount: Rung;
  readonly police: Readonly<Record<Rung, number>>;
}

export const launchRules: RaceRules = {
  celebrities: true,
  fieldSize: 10,
  levelCount: 3,
  police: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
};

export interface Rungs {
  readonly lowest: Rung;
  readonly highest: Rung;
}

export const levelsOf = (rules: RaceRules): readonly Rung[] =>
  rungs.filter((level) => level <= rules.levelCount);

export const levelAfter = (rules: RaceRules, level: Rung): Rung | null =>
  levelsOf(rules).find((next) => next === level + 1) ?? null;

const TOP_RUNG = rungs.length;

const highestRungAt = (rules: RaceRules, level: number): number =>
  1 + Math.round(((level - 1) * (TOP_RUNG - 1)) / (rules.levelCount - 1));

const rungNumbered = (value: number): Rung => {
  const rung = rungs.find((each) => each === value);
  if (rung === undefined) {
    throw new Error(`The career tables have no rung ${value}.`);
  }
  return rung;
};

export const rungsOf = (rules: RaceRules, level: Rung): Rungs => ({
  highest: rungNumbered(highestRungAt(rules, level)),
  lowest: rungNumbered(Math.max(1, highestRungAt(rules, level - 1) + 1)),
});

export const climbOf = (rules: RaceRules, level: Rung): number => {
  const next = levelAfter(rules, level);
  return next === null
    ? highestRungAt(rules, level) - highestRungAt(rules, level - 1)
    : highestRungAt(rules, next) - highestRungAt(rules, level);
};

export const rungsWithin = ({ lowest, highest }: Rungs): readonly Rung[] =>
  rungs.filter((rung) => rung >= lowest && rung <= highest);

export const levelReaching = (rules: RaceRules, rung: Rung): Rung => {
  const level = levelsOf(rules).find(
    (each) => rungsOf(rules, each).highest >= rung
  );
  if (level === undefined) {
    throw new Error(`No level reaches rung ${rung}.`);
  }
  return level;
};
