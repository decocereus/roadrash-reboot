import type { RaceView } from "@racer/sim/race-view";
import { riderIdAt, riderOf } from "@racer/sim/state";
import type { RiderId } from "@racer/sim/state";

import { engineCharacters } from "./characters.ts";

export const PASSING_VOICES = 4;
const RANGE = 70;
const CAR_KEY = 1000;
const NOBODY = -1;
const SOUND_SPEED = 343;
const DOPPLER = 2.5;
const MOST_DOPPLER = 0.35;
const BIKE_GAIN = 0.07;
const CAR_GAIN = 0.05;
const WIDEST_PAN = 0.85;
const NEAR_SIDE = 6;
const LONG_CAR = 3;

export interface Passing {
  key: number;
  fresh: boolean;
  bike: boolean;
  hertz: number;
  cutoff: number;
  gain: number;
  pan: number;
}

export const passingVoices = (): readonly Passing[] =>
  Array.from({ length: PASSING_VOICES }, () => ({
    bike: false,
    cutoff: 0,
    fresh: false,
    gain: 0,
    hertz: 0,
    key: NOBODY,
    pan: 0,
  }));

const chosenKeys = new Int32Array(PASSING_VOICES);
const chosenAway = new Float64Array(PASSING_VOICES);
const chosenTaken = new Uint8Array(PASSING_VOICES);
let chosen = 0;

const consider = (key: number, away: number): void => {
  if (away > RANGE) {
    return;
  }
  let at = chosen;
  if (chosen === PASSING_VOICES) {
    if (away >= (chosenAway[PASSING_VOICES - 1] ?? 0)) {
      return;
    }
    at = PASSING_VOICES - 1;
  } else {
    chosen += 1;
  }
  while (at > 0 && (chosenAway[at - 1] ?? 0) > away) {
    chosenKeys[at] = chosenKeys[at - 1] ?? NOBODY;
    chosenAway[at] = chosenAway[at - 1] ?? 0;
    at -= 1;
  }
  chosenKeys[at] = key;
  chosenAway[at] = away;
};

const chosenIndexOf = (key: number): number => {
  for (let index = 0; index < chosen; index += 1) {
    if (chosenKeys[index] === key) {
      return index;
    }
  }
  return NOBODY;
};

const place = (
  voice: Passing,
  ds: number,
  dx: number,
  closing: number,
  gain: number
): void => {
  const away = Math.hypot(ds, dx);
  const fade = Math.max(0, 1 - away / RANGE);
  const approach = (-Math.sign(ds) * closing) / SOUND_SPEED;
  const shift = Math.max(
    -MOST_DOPPLER,
    Math.min(MOST_DOPPLER, approach * DOPPLER)
  );
  voice.hertz *= 1 + shift;
  voice.gain = gain * fade * fade;
  voice.pan =
    Math.max(-1, Math.min(1, dx / (Math.abs(ds) + NEAR_SIDE))) * WIDEST_PAN;
};

const tune = (view: RaceView, voice: Passing, me: RiderId): void => {
  const listener = riderOf(view.riders, me);
  if (!listener) {
    voice.gain = 0;
    return;
  }
  if (voice.key >= CAR_KEY) {
    const car = view.cars[voice.key - CAR_KEY];
    if (!car) {
      voice.gain = 0;
      return;
    }
    const speed = Math.abs(car.speed);
    voice.bike = false;
    voice.hertz = (car.halfLength > LONG_CAR ? 30 : 42) + speed * 0.9;
    voice.cutoff = 260 + speed * 10;
    place(
      voice,
      car.s - listener.s,
      car.x - listener.x,
      car.speed - listener.speed,
      CAR_GAIN
    );
    return;
  }
  const rider = riderOf(view.riders, riderIdAt(voice.key));
  if (!rider) {
    voice.gain = 0;
    return;
  }
  const character = engineCharacters[rider.bike.bikeClass];
  voice.bike = true;
  voice.hertz =
    character.idle + (character.redline - character.idle) * rider.revs ** 1.1;
  voice.cutoff = character.tone + rider.revs * 900;
  place(
    voice,
    rider.s - listener.s,
    rider.x - listener.x,
    rider.speed - listener.speed,
    BIKE_GAIN
  );
};

export const hearPassing = (
  view: RaceView,
  me: RiderId,
  voices: readonly Passing[]
): void => {
  chosen = 0;
  const listener = riderOf(view.riders, me);
  if (listener) {
    for (let index = 0; index < view.riders.length; index += 1) {
      const rider = view.riders[index];
      if (rider && rider !== listener && rider.mode === "riding") {
        consider(index, Math.hypot(rider.s - listener.s, rider.x - listener.x));
      }
    }
    for (let index = 0; index < view.cars.length; index += 1) {
      const car = view.cars[index];
      if (car) {
        consider(
          CAR_KEY + index,
          Math.hypot(car.s - listener.s, car.x - listener.x)
        );
      }
    }
  }
  chosenTaken.fill(0);
  for (const voice of voices) {
    const index = chosenIndexOf(voice.key);
    voice.fresh = false;
    if (index === NOBODY) {
      voice.key = NOBODY;
    } else {
      chosenTaken[index] = 1;
    }
  }
  for (const voice of voices) {
    if (voice.key === NOBODY) {
      for (let index = 0; index < chosen; index += 1) {
        if (chosenTaken[index] === 0) {
          chosenTaken[index] = 1;
          voice.key = chosenKeys[index] ?? NOBODY;
          voice.fresh = true;
          break;
        }
      }
    }
    if (voice.key === NOBODY) {
      voice.gain = 0;
    } else {
      tune(view, voice, me);
    }
  }
};
