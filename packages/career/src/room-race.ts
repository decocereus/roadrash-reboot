import { firstRacers, roomSetup } from "@racer/sim/room";
import type { RiderId } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";

import { practiceSetup } from "./field.ts";
import type { CareerRaceSetup, PracticeRace } from "./field.ts";
import { launchRules } from "./rules.ts";
import { STARTING_BIKE } from "./tables.ts";

const roomRaceOf = (seed: number): PracticeRace => ({
  bikeId: STARTING_BIKE,
  level: 1,
  roadId: "slag-row",
  seed,
});

export interface SeatedRace {
  readonly setup: CareerRaceSetup;
  readonly humans: readonly RiderId[];
}

export const seatedRace = (seed: number, seats: number): SeatedRace => {
  const race = roomRaceOf(seed);
  const setup = practiceSetup(
    launchRules,
    race,
    trackFor(race.roadId, race.level)
  );
  const humans = firstRacers(setup, seats);
  return { humans, setup: roomSetup(setup, humans) };
};
