import {
  placeRiderAcross,
  placeRiderAt,
  relocateTraffic,
  setRiderSpeed,
} from "./commands.ts";
import { pilotInput } from "./pilot.ts";
import type { RaceView } from "./race-view.ts";
import { createRace, stepRace } from "./race.ts";
import { riderOf } from "./state.ts";
import type { RaceSetup, RiderId, RiderInput } from "./state.ts";

export interface RaceRun {
  readonly view: RaceView;
  readonly step: (inputs: readonly RiderInput[]) => void;
  readonly pilot: (id: RiderId, input: RiderInput) => void;
  readonly placeRiderAt: (id: RiderId, s: number) => void;
  readonly placeRiderAcross: (id: RiderId, x: number) => void;
  readonly setRiderSpeed: (id: RiderId, speed: number) => void;
  readonly relocateTraffic: (from: number, to: number) => void;
}

export const createRaceRun = (setup: RaceSetup): RaceRun => {
  const state = createRace(setup);
  const { track } = setup;
  return {
    pilot: (id, input) => {
      const rider = riderOf(state.riders, id);
      if (rider) {
        pilotInput(state, track, rider, input);
      }
    },
    placeRiderAcross: (id, x) => {
      placeRiderAcross(state, id, x);
    },
    placeRiderAt: (id, s) => {
      placeRiderAt(state, id, s);
    },
    relocateTraffic: (from, to) => {
      relocateTraffic(state, from, to);
    },
    setRiderSpeed: (id, speed) => {
      setRiderSpeed(state, id, speed);
    },
    step: (inputs) => {
      stepRace(state, track, inputs);
    },
    view: state,
  };
};
