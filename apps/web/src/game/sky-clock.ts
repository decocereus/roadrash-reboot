import * as THREE from "three";

import type { Air, Hour, Look } from "./looks.ts";

const STEPS = 1000;

type Triple = [number, number, number];

type Five<Item> = [Item, Item, Item, Item, Item];

type Three<Item> = [Item, Item, Item];

export interface LiveHour {
  readonly stops: Five<number>;
  readonly sky: Readonly<Five<THREE.Color>>;
  readonly clouds: Readonly<Three<THREE.Color>>;
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

const tripleOf = (from: readonly [number, number, number]): Triple => [
  from[0],
  from[1],
  from[2],
];

const liveOf = (hour: Hour): LiveHour => {
  const [s0, s1, s2, s3, s4] = hour.sky;
  const [c0, c1, c2] = hour.clouds;
  return {
    backdrop: new THREE.Color(hour.backdrop),
    bloom: hour.bloom,
    clouds: [new THREE.Color(c0), new THREE.Color(c1), new THREE.Color(c2)],
    fog: new THREE.Color(hour.fog),
    glow: hour.glow,
    grade: tripleOf(hour.grade),
    ground: new THREE.Color(hour.ground),
    ink: new THREE.Color(hour.ink),
    keyDirection: tripleOf(hour.keyDirection),
    lit: tripleOf(hour.lit),
    night: hour.night,
    rim: new THREE.Color(hour.rim),
    rimDirection: tripleOf(hour.rimDirection),
    shadow: tripleOf(hour.shadow),
    sky: [
      new THREE.Color(s0[1]),
      new THREE.Color(s1[1]),
      new THREE.Color(s2[1]),
      new THREE.Color(s3[1]),
      new THREE.Color(s4[1]),
    ],
    stops: [s0[0], s1[0], s2[0], s3[0], s4[0]],
    sun: new THREE.Color(hour.sun),
    sunElevation: hour.sunElevation,
  };
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
  const { lerp } = THREE.MathUtils;
  into.stops[0] = lerp(from.stops[0], to.stops[0], share);
  into.stops[1] = lerp(from.stops[1], to.stops[1], share);
  into.stops[2] = lerp(from.stops[2], to.stops[2], share);
  into.stops[3] = lerp(from.stops[3], to.stops[3], share);
  into.stops[4] = lerp(from.stops[4], to.stops[4], share);
  into.sky[0].lerpColors(from.sky[0], to.sky[0], share);
  into.sky[1].lerpColors(from.sky[1], to.sky[1], share);
  into.sky[2].lerpColors(from.sky[2], to.sky[2], share);
  into.sky[3].lerpColors(from.sky[3], to.sky[3], share);
  into.sky[4].lerpColors(from.sky[4], to.sky[4], share);
  into.clouds[0].lerpColors(from.clouds[0], to.clouds[0], share);
  into.clouds[1].lerpColors(from.clouds[1], to.clouds[1], share);
  into.clouds[2].lerpColors(from.clouds[2], to.clouds[2], share);
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
  keyframes: readonly [Keyframe, ...Keyframe[]],
  time: number,
  into: LiveHour
): void => {
  let [from] = keyframes;
  let to = from;
  for (const keyframe of keyframes) {
    if (keyframe.at <= time) {
      from = keyframe;
    }
    to = keyframe;
    if (keyframe.at > time) {
      break;
    }
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

export const hourPinOf = (search: string): number | null => {
  const pin = new URLSearchParams(search).get("hour");
  return pin !== null && Number.isFinite(Number(pin))
    ? THREE.MathUtils.clamp(Number(pin), 0, 1)
    : null;
};

export const skyClock = (look: Look): SkyClock => {
  const keyframes: [Keyframe, ...Keyframe[]] = [
    { at: 0, hour: liveOf(look) },
    ...look.later.map((later) => ({ at: later.at, hour: liveOf(later) })),
  ];
  const air = airOf(look.air);
  const hour = liveOf(look);
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
