import type { BikeClass } from "@racer/sim/state";

export interface EngineCharacter {
  readonly idle: number;
  readonly redline: number;
  readonly saw: number;
  readonly square: number;
  readonly growl: number;
  readonly fifth: number;
  readonly lope: number;
  readonly tone: number;
  readonly glide: number;
}

export const engineCharacters = {
  featherweight: {
    fifth: 0,
    glide: 0.02,
    growl: 0,
    idle: 70,
    lope: 0,
    redline: 290,
    saw: 0.35,
    square: 0.7,
    tone: 1100,
  },
  heavyweight: {
    fifth: 0.7,
    glide: 0.05,
    growl: 0.4,
    idle: 44,
    lope: 0.35,
    redline: 190,
    saw: 1,
    square: 0,
    tone: 380,
  },
  middleweight: {
    fifth: 0,
    glide: 0.03,
    growl: 0.5,
    idle: 58,
    lope: 0,
    redline: 235,
    saw: 1,
    square: 0,
    tone: 450,
  },
} as const satisfies Record<BikeClass, EngineCharacter>;
