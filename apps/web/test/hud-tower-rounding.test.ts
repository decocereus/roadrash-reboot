import { describe, expect, it } from "vitest";

import { nearestTenth } from "../src/game/hud-tower.ts";

const MODULUS = 18_446_744_073_709_551_616n;
const MULTIPLIER = 6_364_136_223_846_793_005n;
const INCREMENT = 1_442_695_040_888_963_407n;
const DROPPED = 2048n;
const FRACTION = 9_007_199_254_740_992;
const SEED = 20_261_125n;
const DRAWS = 100_000;
const MS_PER_TICK = 1000 / 60;
const TICKS = 240;
const WHOLE_MS = 100_000;
const HALF_WAYS = [-250, -150, -50, 0, 50, 150, 250] as const;

const fractions = (seed: bigint): (() => number) => {
  let state = seed;
  return () => {
    state = (state * MULTIPLIER + INCREMENT) % MODULUS;
    return Number(state / DROPPED) / FRACTION;
  };
};

const draws = (count: number, gap: () => number): readonly number[] =>
  Array.from({ length: count }, gap);

const misses = (gaps: readonly number[]): readonly number[] =>
  gaps
    .filter(
      (gap) =>
        !Number.isInteger(nearestTenth(gap)) ||
        nearestTenth(gap) !== Math.round(gap / 100)
    )
    .slice(0, 5);

describe("the tower's tenth of a second", () => {
  it("rounds every gap to the tenth Math.round gives, as a whole number", () => {
    const next = fractions(SEED);
    const gaps = {
      halfWays: [...HALF_WAYS],
      negative: draws(DRAWS, () => -next() * 400),
      tickDerived: draws(
        DRAWS,
        () => (Math.floor(next() * TICKS) + next()) * MS_PER_TICK
      ),
      underFifty: draws(DRAWS, () => next() * 50),
      upToFourHundred: draws(3 * DRAWS, () => next() * 400),
      wholeMilliseconds: Array.from(
        { length: 2 * WHOLE_MS + 1 },
        (_, at) => at - WHOLE_MS
      ),
    };
    expect({
      halfWays: misses(gaps.halfWays),
      negative: misses(gaps.negative),
      tickDerived: misses(gaps.tickDerived),
      underFifty: misses(gaps.underFifty),
      upToFourHundred: misses(gaps.upToFourHundred),
      wholeMilliseconds: misses(gaps.wholeMilliseconds),
    }).toStrictEqual({
      halfWays: [],
      negative: [],
      tickDerived: [],
      underFifty: [],
      upToFourHundred: [],
      wholeMilliseconds: [],
    });
  });
});
