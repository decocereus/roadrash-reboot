import * as THREE from "three";

import type { Air, Hour, Look } from "./looks.ts";

const STEPS = 1000;

type Triple = [number, number, number];

type Five<Item> = readonly [Item, Item, Item, Item, Item];

export interface LiveHour {
  readonly stops: Float32Array;
  readonly sky: Five<THREE.Color>;
  readonly clouds: readonly [THREE.Color, THREE.Color, THREE.Color];
  readonly sun: THREE.Color;
  sunElevation: number;
  night: number;
  readonly fog: THREE.Color;
  readonly shadow: Triple;
  readonly lit: Triple;
  readonly keyDirection: Triple;
  readonly rimDirection: Triple;
  readonly rim: THREE.Color;
  readonly ink: THREE.Color;
  readonly backdrop: THREE.Color;
  readonly ground: THREE.Color;
  bloom: number;
  readonly grade: Triple;
  glow: number;
}

interface AirLight {
  readonly haze: THREE.Color;
  readonly hazeShare: number;
}

export interface SkyClock {
  readonly hour: LiveHour;
  readonly at: (time: number) => boolean;
}

const colours = (count: number): THREE.Color[] =>
  Array.from({ length: count }, () => new THREE.Color());

const emptyHour = (): LiveHour => {
  const [s0, s1, s2, s3, s4] = colours(5);
  const [c0, c1, c2] = colours(3);
  if (!(s0 && s1 && s2 && s3 && s4 && c0 && c1 && c2)) {
    throw new Error("A sky hour needs its colours.");
  }
  return {
    backdrop: new THREE.Color(),
    bloom: 0,
    clouds: [c0, c1, c2],
    fog: new THREE.Color(),
    glow: 1,
    grade: [1, 1, 1],
    ground: new THREE.Color(),
    ink: new THREE.Color(),
    keyDirection: [0, 1, 0],
    lit: [1, 1, 1],
    night: 0,
    rim: new THREE.Color(),
    rimDirection: [0, 1, 0],
    shadow: [1, 1, 1],
    sky: [s0, s1, s2, s3, s4],
    stops: new Float32Array(5),
    sun: new THREE.Color(),
    sunElevation: 0,
  };
};

const copyTriple = (into: Triple, from: readonly number[]): void => {
  into[0] = from[0] ?? 0;
  into[1] = from[1] ?? 0;
  into[2] = from[2] ?? 0;
};

const liveOf = (hour: Hour): LiveHour => {
  const live = emptyHour();
  for (let stop = 0; stop < hour.sky.length; stop += 1) {
    const [at, colour] = hour.sky[stop] ?? [0, "#000000"];
    live.stops[stop] = at;
    live.sky[stop]?.set(colour);
  }
  for (let layer = 0; layer < hour.clouds.length; layer += 1) {
    live.clouds[layer]?.set(hour.clouds[layer] ?? "#000000");
  }
  live.sun.set(hour.sun);
  live.sunElevation = hour.sunElevation;
  live.night = hour.night;
  live.fog.set(hour.fog);
  copyTriple(live.shadow, hour.shadow);
  copyTriple(live.lit, hour.lit);
  copyTriple(live.keyDirection, hour.keyDirection);
  copyTriple(live.rimDirection, hour.rimDirection);
  live.rim.set(hour.rim);
  live.ink.set(hour.ink);
  live.backdrop.set(hour.backdrop);
  live.ground.set(hour.ground);
  live.bloom = hour.bloom;
  copyTriple(live.grade, hour.grade);
  live.glow = hour.glow;
  return live;
};

const lerpTriple = (
  into: Triple,
  from: Triple,
  to: Triple,
  share: number
): void => {
  into[0] = THREE.MathUtils.lerp(from[0], to[0], share);
  into[1] = THREE.MathUtils.lerp(from[1], to[1], share);
  into[2] = THREE.MathUtils.lerp(from[2], to[2], share);
};

const blend = (
  into: LiveHour,
  from: LiveHour,
  to: LiveHour,
  share: number
): void => {
  for (let stop = 0; stop < into.sky.length; stop += 1) {
    into.stops[stop] = THREE.MathUtils.lerp(
      from.stops[stop] ?? 0,
      to.stops[stop] ?? 0,
      share
    );
    const fromColour = from.sky[stop];
    const toColour = to.sky[stop];
    if (fromColour && toColour) {
      into.sky[stop]?.lerpColors(fromColour, toColour, share);
    }
  }
  for (let layer = 0; layer < into.clouds.length; layer += 1) {
    const fromColour = from.clouds[layer];
    const toColour = to.clouds[layer];
    if (fromColour && toColour) {
      into.clouds[layer]?.lerpColors(fromColour, toColour, share);
    }
  }
  into.sun.lerpColors(from.sun, to.sun, share);
  into.sunElevation = THREE.MathUtils.lerp(
    from.sunElevation,
    to.sunElevation,
    share
  );
  into.night = THREE.MathUtils.lerp(from.night, to.night, share);
  into.fog.lerpColors(from.fog, to.fog, share);
  lerpTriple(into.shadow, from.shadow, to.shadow, share);
  lerpTriple(into.lit, from.lit, to.lit, share);
  lerpTriple(into.keyDirection, from.keyDirection, to.keyDirection, share);
  lerpTriple(into.rimDirection, from.rimDirection, to.rimDirection, share);
  into.rim.lerpColors(from.rim, to.rim, share);
  into.ink.lerpColors(from.ink, to.ink, share);
  into.backdrop.lerpColors(from.backdrop, to.backdrop, share);
  into.ground.lerpColors(from.ground, to.ground, share);
  into.bloom = THREE.MathUtils.lerp(from.bloom, to.bloom, share);
  lerpTriple(into.grade, from.grade, to.grade, share);
  into.glow = THREE.MathUtils.lerp(from.glow, to.glow, share);
};

interface Keyframe {
  readonly at: number;
  readonly hour: LiveHour;
}

const hourAt = (
  keyframes: readonly Keyframe[],
  time: number,
  into: LiveHour
): void => {
  const [first] = keyframes;
  let from = first;
  let to = first;
  for (const keyframe of keyframes) {
    if (keyframe.at <= time) {
      from = keyframe;
    }
    to = keyframe;
    if (keyframe.at > time) {
      break;
    }
  }
  if (!(from && to)) {
    throw new Error("A sky needs at least one hour.");
  }
  const span = to.at - from.at;
  const share =
    span > 0 ? THREE.MathUtils.clamp((time - from.at) / span, 0, 1) : 0;
  blend(into, from.hour, to.hour, share);
};

export const airOf = (air: Air): AirLight => ({
  haze: new THREE.Color(air.haze),
  hazeShare: air.hazeShare,
});

export const compose = (into: LiveHour, air: AirLight): void => {
  into.fog.lerp(air.haze, air.hazeShare);
  into.backdrop.lerp(air.haze, air.hazeShare);
};

export const hourOf = (nightTick: number, tick: number): number =>
  THREE.MathUtils.clamp(tick / nightTick, 0, 1);

export const skyClock = (look: Look): SkyClock => {
  const keyframes: Keyframe[] = [
    { at: 0, hour: liveOf(look) },
    ...look.later.map((later) => ({ at: later.at, hour: liveOf(later) })),
  ];
  const air = airOf(look.air);
  const hour = emptyHour();
  let step = -1;
  return {
    at(time) {
      const next = Math.round(THREE.MathUtils.clamp(time, 0, 1) * STEPS);
      if (next === step) {
        return false;
      }
      step = next;
      hourAt(keyframes, step / STEPS, hour);
      compose(hour, air);
      return true;
    },
    hour,
  };
};
