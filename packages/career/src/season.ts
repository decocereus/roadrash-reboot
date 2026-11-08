import { MOST_RACERS } from "@racer/sim/race";

import type { Placing } from "./outcome.ts";
import { racerIds } from "./state.ts";
import type { CareerState, RacerId, SeasonEntry } from "./state.ts";

const pointsFor = (placing: Placing, racers: number): number =>
  placing.fate === "busted" || placing.fate === "wrecked"
    ? 0
    : Math.max(0, racers + 1 - placing.place);

export const scoreRace = (
  season: Record<RacerId, SeasonEntry>,
  placings: readonly Placing[]
) => {
  const scored = { ...season };
  for (const placing of placings) {
    const entry = season[placing.racer];
    const points = pointsFor(placing, placings.length);
    const finished = points > 0;
    scored[placing.racer] = {
      bestPlace: finished
        ? Math.min(entry.bestPlace ?? placing.place, placing.place)
        : entry.bestPlace,
      points: entry.points + points,
      wins: entry.wins + (finished && placing.place === 1 ? 1 : 0),
    };
  }
  return scored;
};

const UNPLACED = MOST_RACERS + 1;

const tiebreaks: readonly ((
  left: SeasonEntry,
  right: SeasonEntry
) => number)[] = [
  (left, right) => right.points - left.points,
  (left, right) => right.wins - left.wins,
  (left, right) => (left.bestPlace ?? UNPLACED) - (right.bestPlace ?? UNPLACED),
];

export const boardOrder =
  (season: Readonly<Record<RacerId, SeasonEntry>>) =>
  (left: RacerId, right: RacerId): number => {
    for (const tiebreak of tiebreaks) {
      const order = tiebreak(season[left], season[right]);
      if (order !== 0) {
        return order;
      }
    }
    return racerIds.indexOf(left) - racerIds.indexOf(right);
  };

export interface BoardRow {
  readonly racer: RacerId;
  readonly rank: number;
  readonly points: number;
  readonly wins: number;
}

export const seasonBoard = (career: CareerState): readonly BoardRow[] => {
  const { season } = career;
  return racerIds.toSorted(boardOrder(season)).map((racer, index) => ({
    points: season[racer].points,
    racer,
    rank: index + 1,
    wins: season[racer].wins,
  }));
};
