import type { RaceView, RiderView } from "@racer/sim/race-view";
import type { RiderId } from "@racer/sim/state";

import type { EngineControl } from "./engine-control.ts";
import { gainGlide, pitchGlide } from "./glide.ts";
import type { Glide, Param } from "./glide.ts";
import { hearPassing, NOBODY, passingVoices } from "./passing.ts";
import type { Passing } from "./passing.ts";

const RUSH_SPEED = 75;
const SCRUB_FROM = 0.6;
const SCRUB_SPEED = 30;
const HANDOFF_SECONDS = 0.06;

export interface Ride {
  on: boolean;
  speed: number;
  throttle: number;
  revs: number;
  offRoad: boolean;
  lean: number;
  brake: number;
}

export const stillRide = (): Ride => ({
  brake: 0,
  lean: 0,
  offRoad: false,
  on: false,
  revs: 0,
  speed: 0,
  throttle: 0,
});

export const rideFrom = (
  ride: Ride,
  me: RiderView,
  riding: boolean,
  throttleHeard: boolean
): void => {
  const grounded = riding && !me.airborne;
  ride.on = riding;
  ride.speed = riding ? me.speed : 0;
  ride.throttle = riding && throttleHeard ? me.input.throttle : 0;
  ride.revs = riding ? me.revs : 0;
  ride.offRoad = riding && me.offRoad;
  ride.lean = grounded ? me.lean / me.bike.visualLean : 0;
  ride.brake = grounded ? me.brake : 0;
};

export interface BandParams {
  readonly gain: Param;
  readonly tone: Param;
}

export interface Band {
  readonly gain: Glide;
  readonly tone: Glide;
}

export const bandControl = (params: BandParams, seconds: number): Band => ({
  gain: gainGlide(params.gain, seconds),
  tone: pitchGlide(params.tone, seconds),
});

export interface PassingParams {
  readonly gate: Param;
  readonly level: Param;
  readonly high: Param;
  readonly low: Param;
  readonly mix: Param;
  readonly tone: Param;
  readonly pan: Param;
}

export interface PassingOut {
  readonly gate: Param;
  readonly mix: Param;
  readonly high: Glide;
  readonly low: Glide;
  readonly tone: Glide;
  readonly level: Glide;
  readonly pan: Glide;
  key: number;
  openAt: number;
}

export const passingOut = (params: PassingParams): PassingOut => ({
  gate: params.gate,
  high: pitchGlide(params.high, 0.06),
  key: NOBODY,
  level: gainGlide(params.level, 0.08),
  low: pitchGlide(params.low, 0.06),
  mix: params.mix,
  openAt: 0,
  pan: gainGlide(params.pan, 0.05),
  tone: pitchGlide(params.tone, 0.08),
});

export interface RaceMix {
  engine: EngineControl | null;
  wind: Band | null;
  scrub: Band | null;
  readonly outs: PassingOut[];
  readonly passing: readonly Passing[];
}

export const createRaceMix = (): RaceMix => ({
  engine: null,
  outs: [],
  passing: passingVoices(),
  scrub: null,
  wind: null,
});

const scrubOf = ({ brake, lean, on, speed }: Ride): number => {
  if (!on) {
    return 0;
  }
  const fast = Math.min(1, speed / SCRUB_SPEED);
  const hard = Math.max(0, (Math.abs(lean) - SCRUB_FROM) / (1 - SCRUB_FROM));
  return fast * Math.min(1, hard * 0.8 + brake * 0.6) * 0.2;
};

export const rideMix = (mix: RaceMix, ride: Ride, now: number): void => {
  const { engine, scrub, wind } = mix;
  const { offRoad, on, revs, speed, throttle } = ride;
  engine?.drive(on, revs, throttle, now);
  const rush = on ? Math.min(1, speed / RUSH_SPEED) : 0;
  wind?.gain.to(rush * rush * 0.26 + (on && offRoad ? 0.12 : 0), now);
  wind?.tone.to(offRoad ? 240 : 500 + rush * 1100, now);
  scrub?.gain.to(offRoad ? 0 : scrubOf(ride), now);
  scrub?.tone.to(1000 + ride.brake * 700, now);
};

const handOff = (voice: Passing, out: PassingOut, now: number): void => {
  const quiet = now + HANDOFF_SECONDS;
  out.gate.cancelScheduledValues(now);
  out.gate.setValueAtTime(1, now);
  out.gate.linearRampToValueAtTime(0, quiet);
  out.high.set(voice.hertz, quiet);
  out.low.set(voice.hertz / 2, quiet);
  out.tone.set(voice.cutoff, quiet);
  out.level.set(voice.gain, quiet);
  out.pan.set(voice.pan, quiet);
  out.mix.setValueAtTime(voice.bike ? 0.5 : 1, quiet);
  out.gate.linearRampToValueAtTime(1, quiet + HANDOFF_SECONDS);
  out.key = voice.key;
  out.openAt = quiet + HANDOFF_SECONDS;
};

const tunePassing = (voice: Passing, out: PassingOut, now: number): void => {
  if (now < out.openAt) {
    return;
  }
  if (voice.key === NOBODY) {
    out.level.to(0, now);
    return;
  }
  if (voice.key !== out.key) {
    handOff(voice, out, now);
    return;
  }
  out.high.to(voice.hertz, now);
  out.low.to(voice.hertz / 2, now);
  out.tone.to(voice.cutoff, now);
  out.level.to(voice.gain, now);
  out.pan.to(voice.pan, now);
};

export const hearMix = (
  mix: RaceMix,
  view: RaceView,
  me: RiderId,
  now: number
): void => {
  const { outs, passing } = mix;
  if (outs.length === 0) {
    return;
  }
  hearPassing(view, me, passing);
  for (let index = 0; index < passing.length; index += 1) {
    const voice = passing[index];
    const out = outs[index];
    if (voice && out) {
      tunePassing(voice, out, now);
    }
  }
};

export const hushMix = (mix: RaceMix, now: number): void => {
  mix.engine?.drive(false, 0, 0, now);
  mix.wind?.gain.to(0, now);
  mix.scrub?.gain.to(0, now);
  for (const out of mix.outs) {
    out.openAt = 0;
    out.level.to(0, now);
  }
};
