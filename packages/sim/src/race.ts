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
import { applyControl } from "./control.ts";
import { meetHazards, spawnScheduledHazards } from "./hazards.ts";
import type { ThrowForHazard } from "./hazards.ts";
import { PLAYER_COLOURS } from "./palette.ts";
import { createPilotHistory } from "./pilot-history.ts";
import { pilotRider } from "./pilot.ts";
import { PULL_OVER, stepPolice } from "./police.ts";
import type { RaceView, RiderView } from "./race-view.ts";
import { throwRider } from "./rider-crash.ts";
import { stepRider } from "./rider.ts";
import { FULL_CONDITION, MAX_STAMINA, riderOf, rosterOf } from "./state.ts";
import type {
  BikeSpec,
  Controller,
  InputFrame,
  PacingRules,
  PlayerSetup,
  PoliceSetup,
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderId,
  RiderInput,
  RiderProfile,
  RiderState,
} from "./state.ts";
import { createTraffic, stepTraffic } from "./traffic.ts";
import { weapons } from "./weapons.ts";

const GRID_S = -2;
const GRID_ROW_GAP = 7;
const FIRST_COP_S = 1500;
const LAST_COP_BEFORE_FINISH = 1000;
const PILOT_DICE_SALT = 0x5a_17;
const HAZARD_DICE_SALT = 0x2e_c3;
const DEFAULT_LEVEL = 3;
export const MOST_RACERS = 15;
const MOST_RIVALS = MOST_RACERS - 1;

export const neutralInput: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
};

export const noHandovers: ReadonlyMap<RiderId, Controller> = new Map();

export const emptyFrame: InputFrame = {
  controls: new Map(),
  handovers: noHandovers,
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
  topSpeed: 48,
};

const defaultPacing: PacingRules = {
  catchUp: 0.06,
  leadEase: 0.18,
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
  pacing: defaultPacing,
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
  readonly id: RiderId;
  readonly controller: Controller;
  readonly profile: RiderProfile;
  readonly bike: BikeSpec;
  readonly weaponHits: number;
  readonly grudge: RiderId | null;
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
  brake: 0,
  bumpLoss: 0,
  bumpedBy: -1,
  chase: null,
  condition: FULL_CONDITION,
  controller: entry.controller,
  crashes: 0,
  finishTick: -1,
  gear: 1,
  grudge: entry.grudge,
  hazardContacts: [],
  hazardMissed: false,
  hazardSeen: -1,
  heading: 0,
  hitStun: 0,
  id: entry.id,
  idleTicks: 0,
  input: { ...neutralInput },
  jumpMisread: false,
  jumpSeen: -1,
  lastHitBy: null,
  lastHitTick: 0,
  lateralSpeed: 0,
  lean: 0,
  load: 1,
  mode: "riding",
  modeTicks: 0,
  offRoad: false,
  parked: false,
  pilotLine: Number.NaN,
  post: spot.s,
  profile: entry.profile,
  revs: 0,
  s: spot.s,
  shiftTicks: 0,
  slip: 0,
  slipFrom: -1,
  slipTicks: 0,
  speed: 0,
  staleBrake: false,
  staleSteer: false,
  staleThrottle: false,
  stamina: MAX_STAMINA,
  throttle: 0,
  tuck: 0,
  tuckTicks: 0,
  verticalSpeed: 0,
  weapon: entry.weaponHits > 0 ? entry.profile.weapon : "none",
  weaponAtThrow: "none",
  weaponHits: entry.weaponHits,
  wobble: 0,
  x: spot.x,
});

type GridColumns = readonly [number, ...number[]];

const gridColumns = (track: Track): GridColumns => [
  ...track.sameWayLanes,
  ...track.oncomingLanes,
];

const gridSpot = (columns: GridColumns, slot: number): GridSpot => ({
  s: GRID_S - Math.floor(slot / columns.length) * GRID_ROW_GAP,
  x: columns[slot % columns.length] ?? columns[0],
});

const lastRow = (columns: GridColumns, rivalCount: number): GridSpot => ({
  s: GRID_S - Math.ceil(rivalCount / columns.length) * GRID_ROW_GAP,
  x: columns[0],
});

const freshHits = (profile: RiderProfile): number =>
  weapons[profile.weapon].hits;

const copPost = (track: Track, index: number, count: number): number => {
  const last = Math.max(FIRST_COP_S, track.length - LAST_COP_BEFORE_FINISH);
  const spacing = count > 1 ? (last - FIRST_COP_S) / (count - 1) : 0;
  return FIRST_COP_S + index * spacing;
};

export type SetupError =
  | { readonly kind: "tooManyRivals"; readonly count: number }
  | { readonly kind: "duplicateRival"; readonly name: string }
  | { readonly kind: "missingBike"; readonly rider: string }
  | { readonly kind: "strayGrudge"; readonly rider: string };

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

const strayGrudges = (setup: RaceSetup): SetupError[] => {
  const roster = rosterOf(setup);
  const racers = new Set([roster.player, ...roster.rivals]);
  return setup.rivals
    .filter(
      (rival, at) =>
        rival.grudge !== undefined &&
        (rival.grudge === roster.rivals[at] || !racers.has(rival.grudge))
    )
    .map((rival) => ({ kind: "strayGrudge", rider: rival.name }));
};

export const validateSetup = (setup: RaceSetup): SetupError[] => [
  ...(setup.rivals.length > MOST_RIVALS
    ? [{ count: setup.rivals.length, kind: "tooManyRivals" } as const]
    : []),
  ...duplicateRivals(setup),
  ...missingBikes(setup),
  ...strayGrudges(setup),
];

const describeSetupError = (error: SetupError): string => {
  switch (error.kind) {
    case "tooManyRivals": {
      return `A race takes at most ${MOST_RIVALS} rivals, and this one has ${error.count}.`;
    }
    case "duplicateRival": {
      return `${error.name} is on the grid more than once.`;
    }
    case "missingBike": {
      return `${error.rider} has no bike.`;
    }
    case "strayGrudge": {
      return `${error.rider} holds a grudge against a rider who is not another racer in this race.`;
    }
    default: {
      return error satisfies never;
    }
  }
};

export const createRace = (setup: RaceSetup): RaceState => {
  const problems = validateSetup(setup);
  if (problems.length > 0) {
    throw new Error(problems.map(describeSetupError).join(" "));
  }
  const {
    gridOrder,
    pacing,
    player,
    police,
    rivals: field,
    seed,
    track,
  } = setup;
  const columns = gridColumns(track);
  const playerLast = gridOrder === "playerLast";
  const roster = rosterOf(setup);
  const riders = [
    createRider(
      {
        aggressionBoost: 0,
        bike: player.bike,
        controller: player.controller ?? "human",
        grudge: null,
        id: roster.player,
        profile: profileOf(player),
        weaponHits: player.weapon === "none" ? 0 : player.weaponHits,
      },
      playerLast ? lastRow(columns, field.length) : gridSpot(columns, 0)
    ),
  ];
  for (let index = 0; index < field.length; index += 1) {
    const rival = field[index];
    const id = roster.rivals[index];
    if (!rival || id === undefined) {
      continue;
    }
    riders.push(
      createRider(
        {
          aggressionBoost: rival.aggressionBoost ?? 0,
          bike: rival.bike,
          controller: rival.controller ?? "pilot",
          grudge: rival.grudge ?? null,
          id,
          profile: profileOf(rival),
          weaponHits: freshHits(rival),
        },
        gridSpot(columns, playerLast ? index : index + 1)
      )
    );
  }
  for (let index = 0; index < police.count; index += 1) {
    const id = roster.police[index];
    if (id === undefined) {
      continue;
    }
    const cop = createRider(
      {
        aggressionBoost: 0,
        bike: police.bike,
        controller: "pilot",
        grudge: null,
        id,
        profile: police.officer,
        weaponHits: freshHits(police.officer),
      },
      {
        s: copPost(track, index, police.count),
        x: track.roadHalfWidth + PULL_OVER,
      }
    );
    cop.parked = true;
    riders.push(cop);
  }
  const state: RaceState = {
    cars: createTraffic(track, createRandom(seed)),
    dice: nextSeed(seed + PILOT_DICE_SALT),
    events: [],
    hazardDice: nextSeed(seed + HAZARD_DICE_SALT),
    hazards: [],
    pacing: { catchUp: pacing.catchUp, leadEase: pacing.leadEase },
    pilot: createPilotHistory(),
    police: {
      beat: police.beat,
      fine: police.fine,
      sightRange: police.sightRange,
      topSpeed: police.topSpeed,
    },
    riders,
    tick: 0,
  };
  spawnScheduledHazards(state, track);
  return state;
};

export const distanceLeft = (track: Track, rider: RiderView): number =>
  Math.max(0, track.length - rider.bodyS);

const standingGroup = (rider: RiderView): number => {
  if (rider.finishTick >= 0) {
    return 0;
  }
  return rider.mode === "busted" || rider.mode === "wrecked" ? 2 : 1;
};

export const standings = (state: RaceView): RiderId[] =>
  state.riders
    .filter((rider) => rider.profile.role === "racer")
    .toSorted((left, right) => {
      const group = standingGroup(left) - standingGroup(right);
      if (group !== 0) {
        return group;
      }
      if (left.finishTick >= 0) {
        return left.finishTick - right.finishTick;
      }
      return right.bodyS - left.bodyS;
    })
    .map((rider) => rider.id);

const throwForHazard: ThrowForHazard = (
  state,
  rider,
  cause,
  bikeKeep,
  bodyKeep,
  hazard
) => {
  throwRider(state, rider, cause, bikeKeep, bodyKeep, undefined, hazard);
};

type Landing = Extract<RaceEvent, { kind: "land" }>;

const touchdownOf = (
  state: RaceState,
  rider: RiderState,
  from: number
): Landing | undefined => {
  for (let index = from; index < state.events.length; index += 1) {
    const event = state.events[index];
    if (event?.kind === "land" && event.rider === rider.id) {
      return event;
    }
  }
  return undefined;
};

type FrameProblem =
  | { readonly kind: "missingControl"; readonly rider: RiderId }
  | { readonly kind: "pilotControl"; readonly rider: RiderId }
  | { readonly kind: "unknownRider"; readonly rider: RiderId }
  | {
      readonly kind: "sameController";
      readonly rider: RiderId;
      readonly controller: Controller;
    };

const controllerAfter = (rider: RiderState, frame: InputFrame): Controller =>
  frame.handovers.get(rider.id) ?? rider.controller;

const frameFits = (state: RaceState, frame: InputFrame): boolean => {
  let humans = 0;
  let handovers = 0;
  for (const rider of state.riders) {
    const handover = frame.handovers.get(rider.id);
    if (handover !== undefined) {
      if (handover === rider.controller) {
        return false;
      }
      handovers += 1;
    }
    const controlled = frame.controls.has(rider.id);
    if (controllerAfter(rider, frame) === "human") {
      if (!controlled) {
        return false;
      }
      humans += 1;
    } else if (controlled) {
      return false;
    }
  }
  return humans === frame.controls.size && handovers === frame.handovers.size;
};

const strangers = (state: RaceState, ids: Iterable<RiderId>): FrameProblem[] =>
  [...ids]
    .filter((id) => !riderOf(state.riders, id))
    .map((id): FrameProblem => ({ kind: "unknownRider", rider: id }));

const frameProblems = (state: RaceState, frame: InputFrame): FrameProblem[] => [
  ...state.riders
    .filter((rider) => frame.handovers.get(rider.id) === rider.controller)
    .map((rider): FrameProblem => ({
      controller: rider.controller,
      kind: "sameController",
      rider: rider.id,
    })),
  ...state.riders
    .filter(
      (rider) =>
        (controllerAfter(rider, frame) === "human") !==
        frame.controls.has(rider.id)
    )
    .map((rider): FrameProblem => ({
      kind:
        controllerAfter(rider, frame) === "human"
          ? "missingControl"
          : "pilotControl",
      rider: rider.id,
    })),
  ...strangers(state, frame.handovers.keys()),
  ...strangers(state, frame.controls.keys()),
];

const describeFrameProblem = (problem: FrameProblem): string => {
  switch (problem.kind) {
    case "missingControl": {
      return `Rider ${problem.rider} is ridden by a human and has no control in the frame.`;
    }
    case "pilotControl": {
      return `Rider ${problem.rider} is ridden by the pilot and has a control in the frame.`;
    }
    case "unknownRider": {
      return `The frame names rider ${problem.rider}, who is not in the race.`;
    }
    case "sameController": {
      return `The frame hands rider ${problem.rider} to the ${problem.controller}, who already rides it.`;
    }
    default: {
      return problem satisfies never;
    }
  }
};

const checkFrame = (state: RaceState, frame: InputFrame): void => {
  if (!frameFits(state, frame)) {
    throw new Error(
      frameProblems(state, frame).map(describeFrameProblem).join(" ")
    );
  }
};

const controlRider = (
  state: RaceState,
  track: Track,
  frame: InputFrame,
  rider: RiderState
): void => {
  rider.controller = controllerAfter(rider, frame);
  switch (rider.controller) {
    case "human": {
      const control = frame.controls.get(rider.id);
      if (control !== undefined) {
        applyControl(control, rider.input);
      }
      return;
    }
    case "pilot": {
      pilotRider(state, track, rider);
      return;
    }
    default: {
      return rider.controller satisfies never;
    }
  }
};

export const stepRace = (
  state: RaceState,
  track: Track,
  frame: InputFrame
): void => {
  checkFrame(state, frame);
  for (const rider of state.riders) {
    controlRider(state, track, frame, rider);
  }
  state.events.length = 0;
  state.tick += 1;
  stepTraffic(state, track);
  for (const rider of state.riders) {
    const fromS = rider.s;
    const fromX = rider.x;
    const eventsBefore = state.events.length;
    stepRider(state, track, rider, rider.input);
    const touchdown = touchdownOf(state, rider, eventsBefore);
    meetHazards(
      state,
      track,
      rider,
      touchdown?.s ?? fromS,
      touchdown?.x ?? fromX,
      throwForHazard
    );
  }
  stepRiderContacts(state, track, throwRider);
  coolDown(state);
  landStrikes(state);
  for (const rider of state.riders) {
    stepAttack(state, rider, rider.input);
  }
  stepPolice(state, track);
};
