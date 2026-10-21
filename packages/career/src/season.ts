import type { Placing } from "./outcome.ts";
import { racerIds } from "./state.ts";
import type { CareerState, RacerId, SeasonEntry } from "./state.ts";
import { FIELD_SIZE } from "./tables.ts";

const pointsFor = (placing: Placing): number =>
  placing.fate === "busted" || placing.fate === "wrecked"
    ? 0
    : Math.max(0, FIELD_SIZE + 1 - placing.place);

export const scoreRace = (
  season: Record<RacerId, SeasonEntry>,
  placings: readonly Placing[],
  race: number
) => {
  const scored = { ...season };
  for (const placing of placings) {
    const entry = season[placing.racer];
    const lastAhead = { ...entry.lastAhead };
    for (const other of placings) {
      if (other.place > placing.place) {
        lastAhead[other.racer] = race;
      }
    }
    scored[placing.racer] = {
      lastAhead,
      points: entry.points + pointsFor(placing),
      wins:
        entry.wins + (placing.place === 1 && pointsFor(placing) > 0 ? 1 : 0),
    };
  }
  return scored;
};

export interface BoardRow {
  readonly racer: RacerId;
  readonly rank: number;
  readonly points: number;
  readonly wins: number;
}

export const seasonBoard = (career: CareerState): readonly BoardRow[] => {
  const { season } = career;
  return racerIds
    .toSorted((left, right) => {
      const points = season[right].points - season[left].points;
      if (points !== 0) {
        return points;
      }
      const wins = season[right].wins - season[left].wins;
      if (wins !== 0) {
        return wins;
      }
      return (
        (season[right].lastAhead[left] ?? 0) -
        (season[left].lastAhead[right] ?? 0)
      );
    })
    .map((racer, index) => ({
      points: season[racer].points,
      racer,
      rank: index + 1,
      wins: season[racer].wins,
    }));
};
