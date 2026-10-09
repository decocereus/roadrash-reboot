import { createRandom } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import { stepRider } from "./rider.ts";
import { streetBike } from "./state.ts";
import type { RaceState, RiderInput, RiderState } from "./state.ts";
import { createTraffic, stepTraffic } from "./traffic.ts";

const GRID_S = -2;

export const neutralInput: RiderInput = { brake: 0, steer: 0, throttle: 0 };

const createRider = (track: Track): RiderState => {
  const x = track.plan.laneWidth / 2;
  return {
    air: 0,
    airTicks: 0,
    airborne: false,
    bodyAir: 0,
    bodyLateralSpeed: 0,
    bodyS: GRID_S,
    bodySpeed: 0,
    bodyVerticalSpeed: 0,
    bodyX: x,
    crashes: 0,
    finishTick: -1,
    heading: 0,
    lateralSpeed: 0,
    lean: 0,
    load: 1,
    mode: "riding",
    modeTicks: 0,
    offRoad: false,
    s: GRID_S,
    speed: 0,
    verticalSpeed: 0,
    x,
  };
};

export const createRace = (track: Track, seed: number): RaceState => ({
  bike: streetBike,
  cars: createTraffic(track, createRandom(seed)),
  events: [],
  riders: [createRider(track)],
  tick: 0,
});

export const stepRace = (
  state: RaceState,
  track: Track,
  inputs: readonly RiderInput[]
): void => {
  state.events.length = 0;
  state.tick += 1;
  stepTraffic(state, track);
  for (let index = 0; index < state.riders.length; index += 1) {
    stepRider(state, track, index, inputs[index] ?? neutralInput);
  }
};
