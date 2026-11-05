import {
  placeRiderAcross,
  placeRiderAt,
  relocateTraffic,
  setRiderSpeed,
} from "./commands.ts";
import type { RaceView } from "./race-view.ts";
import { createRace, stepRace } from "./race.ts";
import type { InputFrame, RaceEvent, RaceSetup, RiderId } from "./state.ts";

export interface RaceRun {
  readonly events: () => readonly RaceEvent[];
  readonly view: RaceView;
  readonly step: (frame: InputFrame) => void;
}

export interface LocalRun extends RaceRun {
  readonly placeRiderAt: (id: RiderId, s: number) => void;
  readonly placeRiderAcross: (id: RiderId, x: number) => void;
  readonly setRiderSpeed: (id: RiderId, speed: number) => void;
  readonly relocateTraffic: (from: number, to: number) => void;
}

export const createRaceRun = (setup: RaceSetup): LocalRun => {
  const state = createRace(setup);
  const { track } = setup;
  return {
    events: () => state.events,
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
    step: (frame) => {
      stepRace(state, track, frame);
    },
    view: state,
  };
};
