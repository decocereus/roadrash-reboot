import {
  placeRiderAcross,
  placeRiderAt,
  relocateTraffic,
  setRiderSpeed,
} from "./commands.ts";
import { pilotInput } from "./pilot.ts";
import type { RaceView } from "./race-view.ts";
import { createRace, stepRace } from "./race.ts";
import type { RaceSetup, RiderInput } from "./state.ts";

export interface RaceRun {
  readonly view: RaceView;
  readonly step: (inputs: readonly RiderInput[]) => void;
  readonly pilot: (riderIndex: number, input: RiderInput) => void;
  readonly placeRiderAt: (riderIndex: number, s: number) => void;
  readonly placeRiderAcross: (riderIndex: number, x: number) => void;
  readonly setRiderSpeed: (riderIndex: number, speed: number) => void;
  readonly relocateTraffic: (from: number, to: number) => void;
}

export const createRaceRun = (setup: RaceSetup): RaceRun => {
  const state = createRace(setup);
  const { track } = setup;
  return {
    pilot: (riderIndex, input) => {
      pilotInput(state, track, riderIndex, input);
    },
    placeRiderAcross: (riderIndex, x) => {
      placeRiderAcross(state, riderIndex, x);
    },
    placeRiderAt: (riderIndex, s) => {
      placeRiderAt(state, riderIndex, s);
    },
    relocateTraffic: (from, to) => {
      relocateTraffic(state, from, to);
    },
    setRiderSpeed: (riderIndex, speed) => {
      setRiderSpeed(state, riderIndex, speed);
    },
    step: (inputs) => {
      stepRace(state, track, inputs);
    },
    view: state,
  };
};
