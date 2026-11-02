import { rollDice, siteSeed, unitOf } from "@racer/track/random";
import type { Track } from "@racer/track/track";
import { walkersAt } from "@racer/track/walk-sites";
import type { WalkKind, WalkSite } from "@racer/track/walk-sites";

import {
  bumpBike,
  entryShare,
  passesClose,
  reportHazard,
  shoveOff,
} from "./hazards.ts";
import { isSignalled, mainLightOf, signalPhaseAt } from "./signals.ts";
import { BIKE_HALF_WIDTH, TICK_RATE, TICK_SECONDS } from "./state.ts";
import type { Pedestrian, RaceState, RiderState } from "./state.ts";

const WALK_PACE = 1.4;
const RUN_PACE = 3;
const RUN_SHARE = 0.15;
const AGAINST_RED_SHARE = 0.08;
const KERB_OUT = 1;
const HALF_BODY = 0.3;
const BODY_HEIGHT = 1.7;
const ZEBRA_SPREAD = 1.5;
const WAIT_SECONDS = 6;
const RETRY_TICKS = 30;
const CLEAR_SECONDS = 5;
const CAR_MARGIN = 6;
const FLINCH_TICKS = 30;
const LIE_SECONDS = 2;
const LIE_SPREAD_SECONDS = 2;
const CONTACT_RANGE = 6;
const CLIP = 0.2;
const CLIP_KEEP = 0.97;
const CLIP_WOBBLE = 0.25;
const STAGGER_SPEED = 14;
export const WALKER_BUMP = {
  fastLoss: 0.08,
  kick: 0.05,
  loss: 0.04,
  upset: 0.7,
} as const;

interface WalkHabit {
  readonly goneSeconds: number;
  readonly goneSpreadSeconds: number;
}

const walkHabits = {
  jaywalk: { goneSeconds: 15, goneSpreadSeconds: 25 },
  unmarked: { goneSeconds: 6, goneSpreadSeconds: 12 },
  zebra: { goneSeconds: 3, goneSpreadSeconds: 7 },
} as const satisfies Record<WalkKind, WalkHabit>;

const kerbOf = (track: Track): number => track.roadHalfWidth + KERB_OUT;

const ticksOf = (seconds: number): number =>
  1 + Math.floor(seconds * TICK_RATE);

const arrive = (pedestrian: Pedestrian, track: Track): void => {
  const side = rollDice(pedestrian) < 0.5 ? -1 : 1;
  pedestrian.across = side === 1 ? -1 : 1;
  pedestrian.drift = 0;
  pedestrian.mode = "waiting";
  pedestrian.wait = ticksOf(rollDice(pedestrian) * WAIT_SECONDS);
  pedestrian.x = side * kerbOf(track);
};

const walkerFor = (
  track: Track,
  site: WalkSite,
  place: number,
  seed: number
): Pedestrian => {
  const pedestrian: Pedestrian = {
    across: 1,
    command: null,
    crossing: site.crossing,
    dice: siteSeed(seed, `${site.id}#${place}`),
    drift: 0,
    halfLength: HALF_BODY,
    halfWidth: HALF_BODY,
    height: BODY_HEIGHT,
    id: `${site.id}#${place}`,
    kind: "pedestrian",
    mode: "waiting",
    s: site.s + (place - 0.5) * ZEBRA_SPREAD,
    wait: 0,
    walkKind: site.kind,
    x: 0,
  };
  arrive(pedestrian, track);
  return pedestrian;
};

export const createPedestrians = (track: Track, seed: number): Pedestrian[] => {
  const pedestrians: Pedestrian[] = [];
  for (const site of track.walkSites) {
    for (let place = 0; place < walkersAt[site.kind]; place += 1) {
      pedestrians.push(walkerFor(track, site, place, seed));
    }
  }
  return pedestrians;
};

export const blocksCars = (pedestrian: Pedestrian): boolean => {
  switch (pedestrian.mode) {
    case "walking":
    case "flinching":
    case "down": {
      return true;
    }
    case "waiting":
    case "gone": {
      return false;
    }
    default: {
      return pedestrian.mode satisfies never;
    }
  }
};

const gapInCars = (state: RaceState, pedestrian: Pedestrian): boolean => {
  for (const car of state.cars) {
    const toward = (pedestrian.s - car.s) * Math.sign(car.cruiseSpeed);
    if (
      toward > -CAR_MARGIN &&
      toward < CLEAR_SECONDS * Math.abs(car.speed) + CAR_MARGIN
    ) {
      return false;
    }
  }
  return true;
};

const mayStepOut = (
  state: RaceState,
  track: Track,
  pedestrian: Pedestrian
): boolean => {
  const crossing = track.crossings[pedestrian.crossing];
  if (!crossing || !isSignalled(crossing)) {
    return gapInCars(state, pedestrian);
  }
  if (mainLightOf(signalPhaseAt(crossing, state.tick)) === "red") {
    return true;
  }
  return (
    unitOf(pedestrian.dice) < AGAINST_RED_SHARE && gapInCars(state, pedestrian)
  );
};

const walkOn = (pedestrian: Pedestrian, pace: number): void => {
  pedestrian.drift = pedestrian.across * pace;
  pedestrian.mode = "walking";
  pedestrian.wait = 0;
};

const walkAcross = (
  pedestrian: Pedestrian,
  track: Track,
  habit: WalkHabit
): void => {
  pedestrian.x += pedestrian.drift * TICK_SECONDS;
  if (
    (pedestrian.x - pedestrian.across * kerbOf(track)) * pedestrian.across >=
    0
  ) {
    pedestrian.drift = 0;
    pedestrian.mode = "gone";
    pedestrian.wait = ticksOf(
      habit.goneSeconds + rollDice(pedestrian) * habit.goneSpreadSeconds
    );
  }
};

const stepPedestrian = (
  state: RaceState,
  track: Track,
  pedestrian: Pedestrian
): void => {
  switch (pedestrian.mode) {
    case "waiting": {
      pedestrian.wait -= 1;
      if (pedestrian.wait <= 0) {
        if (mayStepOut(state, track, pedestrian)) {
          walkOn(
            pedestrian,
            rollDice(pedestrian) < RUN_SHARE ? RUN_PACE : WALK_PACE
          );
        } else {
          pedestrian.wait = RETRY_TICKS;
        }
      }
      break;
    }
    case "walking": {
      walkAcross(pedestrian, track, walkHabits[pedestrian.walkKind]);
      break;
    }
    case "flinching":
    case "down": {
      pedestrian.wait -= 1;
      if (pedestrian.wait <= 0) {
        walkOn(pedestrian, WALK_PACE);
      }
      break;
    }
    case "gone": {
      pedestrian.wait -= 1;
      if (pedestrian.wait <= 0) {
        arrive(pedestrian, track);
      }
      break;
    }
    default: {
      pedestrian.mode satisfies never;
    }
  }
};

export const stepPedestrians = (state: RaceState, track: Track): void => {
  for (const pedestrian of state.pedestrians) {
    stepPedestrian(state, track, pedestrian);
  }
};

const fall = (pedestrian: Pedestrian): void => {
  pedestrian.drift = 0;
  pedestrian.mode = "down";
  pedestrian.wait = ticksOf(
    LIE_SECONDS + rollDice(pedestrian) * LIE_SPREAD_SECONDS
  );
};

const hit = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  index: number,
  pedestrian: Pedestrian
): void => {
  const overlap =
    pedestrian.halfWidth + BIKE_HALF_WIDTH - Math.abs(rider.x - pedestrian.x);
  if (overlap < CLIP) {
    pedestrian.drift = 0;
    pedestrian.mode = "flinching";
    pedestrian.wait = FLINCH_TICKS;
    rider.speed *= CLIP_KEEP;
    rider.wobble = Math.max(rider.wobble, CLIP_WOBBLE);
    reportHazard(state, rider, pedestrian, "stagger");
    return;
  }
  fall(pedestrian);
  if (rider.speed <= STAGGER_SPEED) {
    shoveOff(state, rider, pedestrian, false);
    return;
  }
  bumpBike(track, rider, pedestrian.x, WALKER_BUMP);
  rider.bumpedWalker = index;
  reportHazard(state, rider, pedestrian, "bump");
};

const standing = (pedestrian: Pedestrian): boolean =>
  pedestrian.mode === "walking" || pedestrian.mode === "waiting";

export const meetPedestrians = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  fromS: number,
  fromX: number
): void => {
  const { pedestrians } = state;
  for (let index = 0; index < pedestrians.length; index += 1) {
    const pedestrian = pedestrians[index];
    if (
      pedestrian &&
      rider.mode === "riding" &&
      standing(pedestrian) &&
      Math.abs(pedestrian.s - rider.s) < CONTACT_RANGE
    ) {
      if (
        !rider.airborne &&
        rider.air < pedestrian.height &&
        entryShare(pedestrian, fromS, fromX, rider) >= 0
      ) {
        hit(state, track, rider, index, pedestrian);
      } else if (pedestrian.mode === "walking") {
        passesClose(state, rider, fromS, pedestrian);
      }
    }
  }
};
