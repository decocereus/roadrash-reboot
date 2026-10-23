import { cosKernel, sinKernel, sinKernelTail } from "./math-kernels.ts";
import { quarterTurns } from "./math-reduction.ts";
import type { Remainder } from "./math-reduction.ts";
import { magnitudeWord } from "./math-words.ts";

export { atan } from "./math-atan.ts";

const QUARTER_PI_WORD = 0x3f_e9_21_fb;
const SIN_TINY_WORD = 0x3e_50_00_00;
const COS_TINY_WORD = 0x3e_46_a0_9e;
const NON_FINITE_WORD = 0x7f_f0_00_00;

const remainder: Remainder = { hi: 0, lo: 0 };

const quadrantOf = (turns: number): number => ((turns % 4) + 4) % 4;

export const sin = (x: number): number => {
  const ix = magnitudeWord(x);
  if (ix <= QUARTER_PI_WORD) {
    return ix < SIN_TINY_WORD ? x : sinKernel(x);
  }
  if (ix >= NON_FINITE_WORD) {
    return Number.NaN;
  }
  const quadrant = quadrantOf(quarterTurns(x, remainder));
  const { hi, lo } = remainder;
  switch (quadrant) {
    case 0: {
      return sinKernelTail(hi, lo);
    }
    case 1: {
      return cosKernel(hi, lo);
    }
    case 2: {
      return -sinKernelTail(hi, lo);
    }
    default: {
      return -cosKernel(hi, lo);
    }
  }
};

export const cos = (x: number): number => {
  const ix = magnitudeWord(x);
  if (ix <= QUARTER_PI_WORD) {
    return ix < COS_TINY_WORD ? 1 : cosKernel(x, 0);
  }
  if (ix >= NON_FINITE_WORD) {
    return Number.NaN;
  }
  const quadrant = quadrantOf(quarterTurns(x, remainder));
  const { hi, lo } = remainder;
  switch (quadrant) {
    case 0: {
      return cosKernel(hi, lo);
    }
    case 1: {
      return -sinKernelTail(hi, lo);
    }
    case 2: {
      return -cosKernel(hi, lo);
    }
    default: {
      return sinKernelTail(hi, lo);
    }
  }
};

export const hypot2 = (along: number, across: number): number => {
  const lengthSquared = along * along + across * across;
  return Math.sqrt(lengthSquared);
};
