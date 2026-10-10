import { createRandom, nextSeed } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import { streetBike } from "./bikes.ts";
import { officers, rivalAt, rivals } from "./cast.ts";
import type { RivalId } from "./cast.ts";
import {
  coolDown,
  landStrikes,
  stepAttack,
  stepRiderContacts,
} from "./combat.ts";
import { PLAYER_COLOURS } from "./palette.ts";
import { PULL_OVER, stepPolice } from "./police.ts";
import { stepRider, throwRider } from "./rider.ts";
import { FULL_CONDITION, MAX_STAMINA } from "./state.ts";
import type {
  BikeSpec,
  PlayerSetup,
  PoliceSetup,
  RaceSetup,
  RaceState,
  RiderInput,
  RiderProfile,
  RiderState,
} from "./state.ts";
import { createTraffic, stepTraffic } from "./traffic.ts";
import { weapons } from "./weapons.ts";

const GRID_S = -2;
const GRID_ROW_GAP = 4.5;
const FIRST_COP_S = 700;
const COP_SPACING = 1600;
const PILOT_DICE_SALT = 0x5a_17;
const DEFAULT_LEVEL = 3;
export const MAX_RIVALS = 7;

export const neutralInput: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
};

export const defaultPlayer: PlayerSetup = {
  aggression: 0,
  bike: streetBike,
  jacket: PLAYER_COLOURS,
  name: "You",
  paint: PLAYER_COLOURS,
  role: "racer",
  skill: 1,
  weapon: "none",
  weaponHits: 0,
};

export const defaultPolice: PoliceSetup = {
  beat: 1500,
  bike: streetBike,
  count: 1,
  fine: 1500,
  officer: officers["dolores-pike"].profile,
  sightRange: 40,
  topSpeed: 54,
};

const defaultRivals: readonly RivalId[] = [
  "dee-santangelo",
  "moose-kowalczyk",
  "juno-kade",
  "mags-dunleavy",
  "ruth-ann-bixby",
];

export const defaultSetup = (track: Track, seed: number): RaceSetup => ({
  gridOrder: "playerLast",
  player: defaultPlayer,
  police: defaultPolice,
  rivals: defaultRivals.map((id) => rivalAt(rivals[id], DEFAULT_LEVEL)),
  seed,
  track,
});

const profileOf = (entrant: RiderProfile): RiderProfile => ({
  aggression: entrant.aggression,
  jacket: entrant.jacket,
  name: entrant.name,
  paint: entrant.paint,
  role: entrant.role,
  skill: entrant.skill,
  weapon: entrant.weapon,
});

interface Entry {
  readonly profile: RiderProfile;
  readonly bike: BikeSpec;
  readonly weaponHits: number;
  readonly grudge: number;
  readonly aggressionBoost: number;
}

interface GridSpot {
  readonly s: number;
  readonly x: number;
}

const createRider = (entry: Entry, spot: GridSpot): RiderState => ({
  aggressionBoost: entry.aggressionBoost,
  air: 0,
  airTicks: 0,
  airborne: false,
  attack: "none",
  attackCooldown: 0,
  attackSide: 1,
  attackTicks: 0,
  bike: entry.bike,
  bodyAir: 0,
  bodyLateralSpeed: 0,
  bodyS: spot.s,
  bodySpeed: 0,
  bodyVerticalSpeed: 0,
  bodyX: spot.x,
  bumpLoss: 0,
  chase: -1,
  condition: FULL_CONDITION,
  crashes: 0,
  finishTick: -1,
  grudge: entry.grudge,
  heading: 0,
  hitStun: 0,
  lastHitBy: -1,
  lastHitTick: 0,
  lateralSpeed: 0,
  lean: 0,
  load: 1,
  mode: "riding",
  modeTicks: 0,
  offRoad: false,
  parked: false,
  post: spot.s,
  profile: entry.profile,
  s: spot.s,
  speed: 0,
  stamina: MAX_STAMINA,
  verticalSpeed: 0,
  weapon: entry.weaponHits > 0 ? entry.profile.weapon : "none",
  weaponAtThrow: "none",
  weaponHits: entry.weaponHits,
  x: spot.x,
});

const gridSpot = (lane: number, slot: number): GridSpot => ({
  s: GRID_S - Math.floor(slot / 2) * GRID_ROW_GAP,
  x: slot % 2 === 0 ? lane : -lane,
});

const lastRow = (lane: number, rivalCount: number): GridSpot => ({
  s: GRID_S - Math.ceil(rivalCount / 2) * GRID_ROW_GAP,
  x: lane,
});

const freshHits = (profile: RiderProfile): number =>
  weapons[profile.weapon].hits;

export type SetupError =
  | { readonly kind: "tooManyRivals"; readonly count: number }
  | { readonly kind: "duplicateRival"; readonly name: string }
  | { readonly kind: "missingBike"; readonly rider: string };

const missingBikes = (setup: RaceSetup): SetupError[] => {
  const entrants: readonly { name: string; bike: BikeSpec | undefined }[] = [
    setup.player,
    ...setup.rivals,
    { bike: setup.police.bike, name: setup.police.officer.name },
  ];
  return entrants
    .filter((entrant) => !entrant.bike)
    .map((entrant) => ({ kind: "missingBike", rider: entrant.name }));
};

const duplicateRivals = (setup: RaceSetup): SetupError[] => {
  const names = setup.rivals.map((rival) => rival.name);
  const repeated = new Set(
    names.filter((name, index) => names.indexOf(name) !== index)
  );
  return [...repeated].map((name) => ({ kind: "duplicateRival", name }));
};

export const validateSetup = (setup: RaceSetup): SetupError[] => [
  ...(setup.rivals.length > MAX_RIVALS
    ? [{ count: setup.rivals.length, kind: "tooManyRivals" } as const]
    : []),
  ...duplicateRivals(setup),
  ...missingBikes(setup),
];

export const describeSetupError = (error: SetupError): string => {
  if (error.kind === "tooManyRivals") {
    return `A race takes at most ${MAX_RIVALS} rivals, and this one has ${error.count}.`;
  }
  if (error.kind === "duplicateRival") {
    return `${error.name} is on the grid more than once.`;
  }
  return `${error.rider} has no bike.`;
};

export const createRace = (setup: RaceSetup): RaceState => {
  const problems = validateSetup(setup);
  if (problems.length > 0) {
    throw new Error(problems.map(describeSetupError).join(" "));
  }
  const { gridOrder, player, police, rivals: field, seed, track } = setup;
  const lane = track.plan.laneWidth / 2;
  const playerLast = gridOrder === "playerLast";
  const riders = [
    createRider(
      {
        aggressionBoost: 0,
        bike: player.bike,
        grudge: -1,
        profile: profileOf(player),
        weaponHits: player.weapon === "none" ? 0 : player.weaponHits,
      },
      playerLast ? lastRow(lane, field.length) : gridSpot(lane, 0)
    ),
  ];
  for (const [index, rival] of field.entries()) {
    riders.push(
      createRider(
        {
          aggressionBoost: rival.aggressionBoost ?? 0,
          bike: rival.bike,
          grudge: rival.grudge ?? -1,
          profile: profileOf(rival),
          weaponHits: freshHits(rival),
        },
        gridSpot(lane, playerLast ? index : index + 1)
      )
    );
  }
  for (let index = 0; index < police.count; index += 1) {
    const cop = createRider(
      {
        aggressionBoost: 0,
        bike: police.bike,
        grudge: -1,
        profile: police.officer,
        weaponHits: freshHits(police.officer),
      },
      {
        s: FIRST_COP_S + index * COP_SPACING,
        x: track.roadHalfWidth + PULL_OVER,
      }
    );
    cop.parked = true;
    riders.push(cop);
  }
  return {
    cars: createTraffic(track, createRandom(seed)),
    dice: nextSeed(seed + PILOT_DICE_SALT),
    events: [],
    police: {
      beat: police.beat,
      fine: police.fine,
      sightRange: police.sightRange,
      topSpeed: police.topSpeed,
    },
    riders,
    tick: 0,
  };
};

export const distanceLeft = (track: Track, rider: RiderState): number =>
  Math.max(0, track.length - rider.bodyS);

const standingGroup = (rider: RiderState): number => {
  if (rider.finishTick >= 0) {
    return 0;
  }
  return rider.mode === "busted" || rider.mode === "wrecked" ? 2 : 1;
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
  stepRiderContacts(
    state,
    track,
    (riderIndex, cause, bikeKeep, bodyKeep, speedAtImpact) => {
      throwRider(state, riderIndex, cause, bikeKeep, bodyKeep, speedAtImpact);
    }
  );
  coolDown(state);
  landStrikes(state);
  for (let index = 0; index < state.riders.length; index += 1) {
    stepAttack(state, index, inputs[index] ?? neutralInput);
  }
  stepPolice(state, track);
};
