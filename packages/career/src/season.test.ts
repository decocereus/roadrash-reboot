import { rivalIds } from "@racer/sim/cast";
import { MOST_RACERS } from "@racer/sim/race";
import { createRandom } from "@racer/track/random";
import type { Random } from "@racer/track/random";
import { describe, expect, it } from "vitest";

import { fates } from "./outcome.ts";
import type { Placing } from "./outcome.ts";
import { boardOrder, scoreRace, seasonBoard } from "./season.ts";
import { blankSeason, byRacer, newCareer, racerIds } from "./state.ts";
import type { RacerId, SeasonEntry } from "./state.ts";

const HISTORIES = 300;
const MOST_RACES = 12;

const shuffled = <Item>(random: Random, items: readonly Item[]): Item[] =>
  items
    .map((item) => ({ item, roll: random() }))
    .toSorted((one, other) => one.roll - other.roll)
    .map(({ item }) => item);

const groupOf = (fate: Placing["fate"]): number => {
  switch (fate) {
    case "finished": {
      return 0;
    }
    case "racing": {
      return 1;
    }
    case "busted":
    case "wrecked": {
      return 2;
    }
    default: {
      return fate satisfies never;
    }
  }
};

const placingsOf = (
  order: readonly (readonly [RacerId, Placing["fate"]])[]
): Placing[] =>
  order.map(([racer, fate], at) => ({
    bikeId: "ostra-sesta-600",
    fate,
    finishTick: -1,
    metresLeft: 0,
    place: at + 1,
    racer,
  }));

const raceOf = (random: Random, pool: readonly RacerId[]): Placing[] => {
  const size =
    2 + Math.floor(random() * (Math.min(pool.length, MOST_RACERS) - 1));
  return placingsOf(
    shuffled(random, pool)
      .slice(0, size)
      .map((racer) => ({
        fate: fates[Math.floor(random() * fates.length)] ?? "finished",
        racer,
        roll: random(),
      }))
      .toSorted(
        (one, other) =>
          groupOf(one.fate) - groupOf(other.fate) || one.roll - other.roll
      )
      .map(({ fate, racer }) => [racer, fate] as const)
  );
};

const historyOf = (seed: number): Record<RacerId, SeasonEntry> => {
  const random = createRandom(seed);
  const rivals = shuffled(random, rivalIds);
  const pool = [
    "player",
    ...rivals.slice(0, 2 + Math.floor(random() * rivals.length)),
  ] as const;
  let season = byRacer(() => blankSeason);
  const races = 1 + Math.floor(random() * MOST_RACES);
  for (let race = 0; race < races; race += 1) {
    season = scoreRace(season, raceOf(random, pool));
  }
  return season;
};

const disorderOf = (season: Record<RacerId, SeasonEntry>): string[] => {
  const order = boardOrder(season);
  const behind = new Map(
    racerIds.map((left) => [
      left,
      new Set(racerIds.filter((right) => order(left, right) < 0)),
    ])
  );
  const isAhead = (left: RacerId, right: RacerId) =>
    behind.get(left)?.has(right) === true;
  return racerIds.flatMap((left) =>
    racerIds.flatMap((right) => {
      const placed =
        left === right
          ? !isAhead(left, right)
          : isAhead(left, right) !== isAhead(right, left);
      if (!placed) {
        return [`${left} and ${right} have no one order`];
      }
      return racerIds
        .filter(
          (third) =>
            isAhead(left, right) &&
            isAhead(right, third) &&
            !isAhead(left, third)
        )
        .map(
          (third) =>
            `${left} is ahead of ${right}, who is ahead of ${third}, but ${left} is not ahead of ${third}`
        );
    })
  );
};

describe("the season board", () => {
  it("ranks by points, then wins, then best finish of the season, then the catalogue", () => {
    const first = scoreRace(
      byRacer(() => blankSeason),
      placingsOf([
        ["player", "finished"],
        ["moose-kowalczyk", "finished"],
        ["juno-kade", "finished"],
        ["dee-santangelo", "finished"],
      ])
    );
    const second = scoreRace(
      first,
      placingsOf([
        ["player", "finished"],
        ["juno-kade", "finished"],
        ["dee-santangelo", "finished"],
        ["moose-kowalczyk", "busted"],
      ])
    );
    const board = seasonBoard({ ...newCareer(4), season: second });
    expect(board.slice(0, 5)).toStrictEqual([
      { points: 8, racer: "player", rank: 1, wins: 2 },
      { points: 5, racer: "juno-kade", rank: 2, wins: 0 },
      { points: 3, racer: "moose-kowalczyk", rank: 3, wins: 0 },
      { points: 3, racer: "dee-santangelo", rank: 4, wins: 0 },
      { points: 0, racer: "ruth-ann-bixby", rank: 5, wins: 0 },
    ]);
    expect([
      second["moose-kowalczyk"].bestPlace,
      second["dee-santangelo"].bestPlace,
      second["ruth-ann-bixby"].bestPlace,
    ]).toStrictEqual([2, 3, null]);
  });

  it("puts every pair of racers in one order, and keeps it transitive, over any legal season", () => {
    expect(
      Array.from({ length: HISTORIES }, (_, seed) =>
        disorderOf(historyOf(seed + 1)).map(
          (problem) => `season ${seed + 1}: ${problem}`
        )
      )
        .flat()
        .slice(0, 5)
    ).toStrictEqual([]);
  });
});
