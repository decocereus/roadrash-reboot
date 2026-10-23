import { magnitudeWord } from "./math-words.ts";

export interface Remainder {
  hi: number;
  lo: number;
}

const INVERSE_HALF_PI = 0.6366197723675814;
const HALF_PI_1 = 1.5707963267341256;
const HALF_PI_1_TAIL = 6.077100506506192e-11;
const HALF_PI_2 = 6.077100506303966e-11;
const HALF_PI_2_TAIL = 2.0222662487959506e-21;
const HALF_PI_3 = 2.0222662487111665e-21;
const HALF_PI_3_TAIL = 8.4784276603689e-32;
const ROUND_TO_INTEGER = 6_755_399_441_055_744;
const EXPONENT_UNIT = 1_048_576;

const exponentOf = (word: number): number => Math.floor(word / EXPONENT_UNIT);

const near = (x: number, turns: number, out: Remainder): number => {
  if (x > 0) {
    const z = x - turns * HALF_PI_1;
    const hi = z - turns * HALF_PI_1_TAIL;
    out.hi = hi;
    out.lo = z - hi - turns * HALF_PI_1_TAIL;
    return turns;
  }
  const z = x + turns * HALF_PI_1;
  const hi = z + turns * HALF_PI_1_TAIL;
  out.hi = hi;
  out.lo = z - hi + turns * HALF_PI_1_TAIL;
  return -turns;
};

const medium = (x: number, ix: number, out: Remainder): number => {
  const turns = x * INVERSE_HALF_PI + ROUND_TO_INTEGER - ROUND_TO_INTEGER;
  const exponent = exponentOf(ix);
  let r = x - turns * HALF_PI_1;
  let w = turns * HALF_PI_1_TAIL;
  let hi = r - w;
  if (exponent - exponentOf(magnitudeWord(hi)) > 16) {
    let t = r;
    w = turns * HALF_PI_2;
    r = t - w;
    w = turns * HALF_PI_2_TAIL - (t - r - w);
    hi = r - w;
    if (exponent - exponentOf(magnitudeWord(hi)) > 49) {
      t = r;
      w = turns * HALF_PI_3;
      r = t - w;
      w = turns * HALF_PI_3_TAIL - (t - r - w);
      hi = r - w;
    }
  }
  out.hi = hi;
  out.lo = r - hi - w;
  return turns;
};

export const quarterTurns = (x: number, out: Remainder): number => {
  const ix = magnitudeWord(x);
  if (ix <= 0x40_0f_6a_7a) {
    if (ix % EXPONENT_UNIT === 0x9_21_fb) {
      return medium(x, ix, out);
    }
    return near(x, ix <= 0x40_02_d9_7c ? 1 : 2, out);
  }
  if (ix <= 0x40_15_fd_bc) {
    return ix === 0x40_12_d9_7c ? medium(x, ix, out) : near(x, 3, out);
  }
  if (ix <= 0x40_1c_46_3b) {
    return ix === 0x40_19_21_fb ? medium(x, ix, out) : near(x, 4, out);
  }
  return medium(x, ix, out);
};
