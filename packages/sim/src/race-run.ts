import {
  placeRiderAcross,
  placeRiderAt,
  relocateTraffic,
  setRiderSpeed,
} from "./commands.ts";
import type { RaceView } from "./race-view.ts";
import { createRace, stepRace } from "./race.ts";
import type { RiderCorrection } from "./room-client.ts";
import type { InputFrame, RaceEvent, RaceSetup, RiderId } from "./state.ts";

export interface RaceRun {
  readonly events: () => readonly RaceEvent[];
  readonly takeCorrections: () => readonly RiderCorrection[];
  readonly view: RaceView;
  readonly step: (frame: InputFrame) => void;
}

export interface LocalRun extends RaceRun {
  readonly placeRiderAt: (id: RiderId, s: number) => void;
  readonly placeRiderAcross: (id: RiderId, x: number) => void;
  readonly setRiderSpeed: (id: RiderId, speed: number) => void;
  readonly relocateTraffic: (from: number, to: number) => void;
}

const NO_CORRECTIONS: readonly RiderCorrection[] = [];

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
    takeCorrections: () => NO_CORRECTIONS,
    view: state,
  };
};
