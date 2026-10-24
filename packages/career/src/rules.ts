import { roadLevels } from "@racer/track/road";
import type { RoadLevel } from "@racer/track/road";

export interface RaceRules {
  readonly fieldSize: number;
  readonly levelCount: RoadLevel;
  readonly police: Readonly<Record<RoadLevel, number>>;
}

export const levelsOf = (rules: RaceRules): readonly RoadLevel[] =>
  roadLevels.filter((level) => level <= rules.levelCount);

export const levelAfter = (
  rules: RaceRules,
  level: RoadLevel
): RoadLevel | null =>
  levelsOf(rules).find((next) => next === level + 1) ?? null;
