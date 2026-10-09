import { createRandom } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import { stepAttack, stepRiderContacts } from "./combat.ts";
import { stepRider, throwRider } from "./rider.ts";
import { MAX_STAMINA, streetBike } from "./state.ts";
import type {
  RaceState,
  RiderInput,
  RiderProfile,
  RiderState,
} from "./state.ts";
import { createTraffic, stepTraffic } from "./traffic.ts";

const GRID_S = -2;
const GRID_ROW_GAP = 4.5;

export const neutralInput: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
};

export const playerProfile: RiderProfile = {
  aggression: 0,
  name: "You",
  paint: 0,
  skill: 1,
};

export const rivalProfiles: readonly RiderProfile[] = [
  { aggression: 0.55, name: "Viper", paint: 1, skill: 0.94 },
  { aggression: 0.8, name: "Bruiser", paint: 2, skill: 0.86 },
  { aggression: 0.3, name: "Slick", paint: 3, skill: 0.98 },
  { aggression: 0.65, name: "Ratchet", paint: 4, skill: 0.9 },
  { aggression: 0.45, name: "Nova", paint: 5, skill: 0.92 },
];

const createRider = (
  profile: RiderProfile,
  s: number,
  x: number
): RiderState => ({
  air: 0,
  airTicks: 0,
  airborne: false,
  attack: "none",
  attackCooldown: 0,
  attackSide: 1,
  attackTicks: 0,
  bodyAir: 0,
  bodyLateralSpeed: 0,
  bodyS: s,
  bodySpeed: 0,
  bodyVerticalSpeed: 0,
  bodyX: x,
  crashes: 0,
  finishTick: -1,
  heading: 0,
  hitStun: 0,
  lateralSpeed: 0,
  lean: 0,
  load: 1,
  mode: "riding",
  modeTicks: 0,
  offRoad: false,
  profile,
  s,
  speed: 0,
  stamina: MAX_STAMINA,
  verticalSpeed: 0,
  x,
});

export const createRace = (
  track: Track,
  seed: number,
  rivalCount = rivalProfiles.length
): RaceState => {
  const lane = track.plan.laneWidth / 2;
  const riders = [createRider(playerProfile, GRID_S, lane)];
  for (const [index, profile] of rivalProfiles.slice(0, rivalCount).entries()) {
    const row = Math.floor((index + 1) / 2);
    const side = index % 2 === 0 ? -1 : 1;
    riders.push(createRider(profile, GRID_S - row * GRID_ROW_GAP, side * lane));
  }
  return {
    bike: streetBike,
    cars: createTraffic(track, createRandom(seed)),
    events: [],
    riders,
    tick: 0,
  };
};

export const standings = (state: RaceState): number[] =>
  state.riders
    .map((rider, index) => ({ index, rider }))
    .toSorted((left, right) => {
      const leftDone = left.rider.finishTick >= 0;
      const rightDone = right.rider.finishTick >= 0;
      if (leftDone && rightDone) {
        return left.rider.finishTick - right.rider.finishTick;
      }
      if (leftDone !== rightDone) {
        return leftDone ? -1 : 1;
      }
      return right.rider.bodyS - left.rider.bodyS;
    })
    .map((entry) => entry.index);

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
  stepRiderContacts(state, track, (riderIndex, cause, bikeKeep, bodyKeep) => {
    throwRider(state, riderIndex, cause, bikeKeep, bodyKeep);
  });
  for (let index = 0; index < state.riders.length; index += 1) {
    stepAttack(state, index, inputs[index] ?? neutralInput);
  }
};
