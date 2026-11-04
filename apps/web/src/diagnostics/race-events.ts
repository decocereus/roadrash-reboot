import type { PlayerRaceEnd } from "@racer/telemetry/limits";
import type { PlayerEvent } from "@racer/telemetry/player-events";

type RaceStarted = Omit<
  Extract<PlayerEvent, { readonly event: "race_started" }>,
  "event"
>;

export interface RaceFacts {
  readonly crashes: number;
  readonly place: number;
  readonly roadMetres: number;
  readonly seconds: number;
}

export interface RaceEvents {
  readonly ended: (result: PlayerRaceEnd, facts: RaceFacts) => void;
  readonly started: (race: RaceStarted) => void;
}

export const createRaceEvents = (
  track: (event: PlayerEvent) => void
): RaceEvents => {
  let running: string | null = null;
  return {
    ended(result, facts) {
      if (running !== null) {
        track({ ...facts, event: "race_ended", raceId: running, result });
        running = null;
      }
    },
    started(race) {
      running = race.raceId;
      track({ ...race, event: "race_started" });
    },
  };
};
