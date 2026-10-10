import { createRandom, nextSeed } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import {
  coolDown,
  landStrikes,
  stepAttack,
  stepRiderContacts,
} from "./combat.ts";
import { PULL_OVER, stepPolice } from "./police.ts";
import { stepRider, throwRider } from "./rider.ts";
import { MAX_STAMINA, streetBike } from "./state.ts";
import type {
  RaceState,
  RiderInput,
  RiderProfile,
  RiderState,
} from "./state.ts";
import { createTraffic, stepTraffic } from "./traffic.ts";
import { arm } from "./weapons.ts";

const GRID_S = -2;
const GRID_ROW_GAP = 4.5;
const FIRST_COP_S = 700;
const COP_SPACING = 1600;
const PILOT_DICE_SALT = 0x5a_17;

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
  role: "racer",
  skill: 1,
  weapon: "none",
};

export const rivalProfiles: readonly RiderProfile[] = [
  {
    aggression: 0.55,
    name: "Viper",
    paint: 1,
    role: "racer",
    skill: 0.94,
    weapon: "chain",
  },
  {
    aggression: 0.8,
    name: "Bruiser",
    paint: 2,
    role: "racer",
    skill: 0.86,
    weapon: "club",
  },
  {
    aggression: 0.3,
    name: "Slick",
    paint: 3,
    role: "racer",
    skill: 0.98,
    weapon: "none",
  },
  {
    aggression: 0.65,
    name: "Ratchet",
    paint: 4,
    role: "racer",
    skill: 0.9,
    weapon: "crowbar",
  },
  {
    aggression: 0.45,
    name: "Nova",
    paint: 5,
    role: "racer",
    skill: 0.92,
    weapon: "none",
  },
];

export const copProfile: RiderProfile = {
  aggression: 0.9,
  name: "Police",
  paint: 6,
  role: "police",
  skill: 0.95,
  weapon: "baton",
};

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
  chase: -1,
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
  parked: false,
  profile,
  s,
  speed: 0,
  stamina: MAX_STAMINA,
  verticalSpeed: 0,
  weapon: "none",
  weaponHits: 0,
  x,
});

const armed = (rider: RiderState): RiderState => {
  arm(rider, rider.profile.weapon);
  return rider;
};

export const createRace = (
  track: Track,
  seed: number,
  rivalCount = rivalProfiles.length,
  copCount = 1
): RaceState => {
  const lane = track.plan.laneWidth / 2;
  const riders = [createRider(playerProfile, GRID_S, lane)];
  for (const [index, profile] of rivalProfiles.slice(0, rivalCount).entries()) {
    const row = Math.floor((index + 1) / 2);
    const side = index % 2 === 0 ? -1 : 1;
    riders.push(
      armed(createRider(profile, GRID_S - row * GRID_ROW_GAP, side * lane))
    );
  }
  for (let index = 0; index < copCount; index += 1) {
    const cop = armed(
      createRider(
        copProfile,
        FIRST_COP_S + index * COP_SPACING,
        track.roadHalfWidth + PULL_OVER
      )
    );
    cop.parked = true;
    riders.push(cop);
  }
  return {
    bike: streetBike,
    cars: createTraffic(track, createRandom(seed)),
    dice: nextSeed(seed + PILOT_DICE_SALT),
    events: [],
    riders,
    tick: 0,
  };
};

const standingGroup = (rider: RiderState): number => {
  if (rider.finishTick >= 0) {
    return 0;
  }
  return rider.mode === "busted" ? 2 : 1;
};

export const standings = (state: RaceState): number[] =>
  state.riders
    .map((rider, index) => ({ index, rider }))
    .filter((entry) => entry.rider.profile.role === "racer")
    .toSorted((left, right) => {
      const group = standingGroup(left.rider) - standingGroup(right.rider);
      if (group !== 0) {
        return group;
      }
      if (left.rider.finishTick >= 0) {
        return left.rider.finishTick - right.rider.finishTick;
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
  coolDown(state);
  landStrikes(state);
  for (let index = 0; index < state.riders.length; index += 1) {
    stepAttack(state, index, inputs[index] ?? neutralInput);
  }
  stepPolice(state, track);
};
