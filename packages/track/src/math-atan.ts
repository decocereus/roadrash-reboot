import { magnitudeWord } from "./math-words.ts";

const HALF_HI = 0.4636476090008061;
const HALF_LO = 2.2698777452961687e-17;
const ONE_HI = 0.7853981633974483;
const ONE_LO = 3.061616997868383e-17;
const THREE_HALVES_HI = 0.982793723247329;
const THREE_HALVES_LO = 1.3903311031230998e-17;
const INFINITY_HI = 1.5707963267948966;
const INFINITY_LO = 6.123233995736766e-17;
const T0 = 0.3333333333333293;
const T1 = -0.19999999999876483;
const T2 = 0.14285714272503466;
const T3 = -0.11111110405462356;
const T4 = 0.09090887133436507;
const T5 = -0.0769187620504483;
const T6 = 0.06661073137387531;
const T7 = -0.058335701337905735;
const T8 = 0.049768779946159324;
const T9 = -0.036531572744216916;
const T10 = 0.016285820115365782;

const series = (x: number): number => {
  const z = x * x;
  const w = z * z;
  const odd = z * (T0 + w * (T2 + w * (T4 + w * (T6 + w * (T8 + w * T10)))));
  const even = w * (T1 + w * (T3 + w * (T5 + w * (T7 + w * T9))));
  return x * (odd + even);
};

const shifted = (t: number, hi: number, lo: number): number =>
  hi - (series(t) - lo - t);

const positive = (ix: number, x: number): number => {
  if (ix < 0x3f_e6_00_00) {
    return shifted((2 * x - 1) / (2 + x), HALF_HI, HALF_LO);
  }
  if (ix < 0x3f_f3_00_00) {
    return shifted((x - 1) / (x + 1), ONE_HI, ONE_LO);
  }
  if (ix < 0x40_03_80_00) {
    return shifted((x - 1.5) / (1 + 1.5 * x), THREE_HALVES_HI, THREE_HALVES_LO);
  }
  return shifted(-1 / x, INFINITY_HI, INFINITY_LO);
};

export const atan = (x: number): number => {
  const ix = magnitudeWord(x);
  if (ix >= 0x44_10_00_00) {
    if (Number.isNaN(x)) {
      return Number.NaN;
    }
    return x > 0 ? INFINITY_HI + INFINITY_LO : -INFINITY_HI - INFINITY_LO;
  }
  if (ix < 0x3f_dc_00_00) {
    return ix < 0x3e_40_00_00 ? x : x - series(x);
  }
  const value = positive(ix, Math.abs(x));
  return x < 0 ? -value : value;
};
