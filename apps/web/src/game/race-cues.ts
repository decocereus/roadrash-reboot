import type { RaceOutcome } from "@racer/career/outcome";

import type { Sound } from "../sound/sound.ts";
import type { GamePhase } from "./game-session.ts";

const PLACE_HOLD_MS = 500;
const NOT_COUNTING = Number.POSITIVE_INFINITY;

export interface PlaceHeard {
  place: number;
  racing: boolean;
  atMs: number;
  source: object;
  restores: number;
}

export interface RaceCues {
  readonly countdown: (count: number, phase: GamePhase) => void;
  readonly place: (heard: PlaceHeard) => void;
  readonly settled: (outcome: RaceOutcome) => void;
}

export const createRaceCues = (sound: Pick<Sound, "play">): RaceCues => {
  let lowestCounted = NOT_COUNTING;
  let placeHeard = 0;
  let placeSeen = 0;
  let placeSince = 0;
  let source: object | null = null;
  let restores = 0;

  const rebased = (heard: PlaceHeard): boolean => {
    const moved =
      !heard.racing || heard.source !== source || heard.restores !== restores;
    ({ restores, source } = heard);
    if (moved) {
      placeHeard = heard.place;
      placeSeen = heard.place;
    }
    return moved;
  };

  return {
    countdown(count, phase) {
      if (count > 0) {
        if (count < lowestCounted) {
          lowestCounted = count;
          sound.play("count");
        }
        return;
      }
      if (phase === "racing" && lowestCounted !== NOT_COUNTING) {
        sound.play("go");
      }
      if (phase !== "countdown") {
        lowestCounted = NOT_COUNTING;
      }
    },
    place(heard) {
      if (rebased(heard)) {
        return;
      }
      if (heard.place !== placeSeen) {
        placeSeen = heard.place;
        placeSince = heard.atMs;
        return;
      }
      if (
        heard.place !== placeHeard &&
        heard.atMs - placeSince >= PLACE_HOLD_MS
      ) {
        sound.play(heard.place < placeHeard ? "gained" : "lost");
        placeHeard = heard.place;
      }
    },
    settled(outcome) {
      if (outcome.result === "finished") {
        sound.play("finish");
      }
    },
  };
};
