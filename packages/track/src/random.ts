export type Random = () => number;

const MODULUS = 2 ** 32;
const MULTIPLIER = 1_664_525;
const INCREMENT = 1_013_904_223;

const wrap = (value: number): number => ((value % MODULUS) + MODULUS) % MODULUS;

export const nextSeed = (seed: number): number =>
  wrap(Math.imul(seed, MULTIPLIER) + INCREMENT);

export const unitOf = (seed: number): number => seed / MODULUS;

export const createRandom = (seed: number): Random => {
  let state = wrap(seed);
  for (let warmup = 0; warmup < 4; warmup += 1) {
    state = nextSeed(state);
  }
  return () => {
    state = nextSeed(state);
    return unitOf(state);
  };
};
