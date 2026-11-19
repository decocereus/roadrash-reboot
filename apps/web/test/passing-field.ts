import { createRace, defaultSetup } from "@racer/sim/race";
import { PLAYER_RIDER, riderIdAt, riderOf } from "@racer/sim/state";
import type { RaceState, RiderId } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";

const AT = 400;
const OUT_OF_EARSHOT = 2000;

export const passingField = (): RaceState => {
  const race = createRace(defaultSetup(trackFor("ridge-road"), 7));
  for (const rider of race.riders) {
    rider.s = AT + OUT_OF_EARSHOT;
    rider.x = 0;
  }
  for (const car of race.cars) {
    car.s = AT + OUT_OF_EARSHOT;
  }
  const me = riderOf(race.riders, PLAYER_RIDER);
  if (me) {
    me.s = AT;
  }
  return race;
};

export const placeAhead = (
  race: RaceState,
  index: number,
  gap: number
): RiderId => {
  const id = riderIdAt(index);
  const rider = riderOf(race.riders, id);
  if (rider) {
    rider.s = AT + gap;
    rider.x = 0;
  }
  return id;
};
