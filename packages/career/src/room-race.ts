import type { BikeId } from "@racer/sim/bikes";
import { firstRacers, roomSetup } from "@racer/sim/room";
import type { RiderId } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";

import { practiceSetup } from "./field.ts";
import type { CareerRaceSetup, PracticeRace } from "./field.ts";
import { createRaceLog } from "./outcome.ts";
import { launchRules } from "./rules.ts";
import type { RaceRules } from "./rules.ts";
import type { RacerId } from "./state.ts";
import { STARTING_BIKE } from "./tables.ts";
import type { RoadId, Tier } from "./tables.ts";

const roomRules: RaceRules = { ...launchRules, celebrities: false };

export interface RoomRule {
  readonly bikeId: BikeId;
  readonly roadId: RoadId;
  readonly tier: Tier;
}

export const publicRoomRule: RoomRule = {
  bikeId: STARTING_BIKE,
  roadId: "slag-row",
  tier: 2,
};

export const ROOM_FIELD_SIZE = roomRules.fieldSize;

export interface SeatedRace {
  readonly setup: CareerRaceSetup;
  readonly humans: readonly RiderId[];
  readonly road: RoadId;
}

export const seatedRace = (
  seed: number,
  seats: number,
  rule: RoomRule = publicRoomRule
): SeatedRace => {
  const race: PracticeRace = { ...rule, seed };
  const setup = practiceSetup(roomRules, race, trackFor(race.roadId));
  const humans = firstRacers(setup, seats);
  return { humans, road: race.roadId, setup: roomSetup(setup, humans) };
};

export type GuestNames = ReadonlyMap<RacerId, string>;

export const guestNames = (
  setup: CareerRaceSetup,
  me: RiderId,
  names: readonly string[]
): GuestNames => {
  const humans = firstRacers(setup, names.length);
  return new Map(
    createRaceLog(setup, me).entrants.flatMap((entrant) => {
      const name = names[humans.indexOf(entrant.rider)];
      return name === undefined ? [] : [[entrant.rival, name] as const];
    })
  );
};
