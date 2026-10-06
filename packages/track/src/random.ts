export type Random = () => number;

const MODULUS = 2 ** 32;
const MULTIPLIER = 1_664_525;
const INCREMENT = 1_013_904_223;

const wrap = (value: number): number => ((value % MODULUS) + MODULUS) % MODULUS;

export const createRandom = (seed: number): Random => {
  let state = wrap(seed);
  for (let warmup = 0; warmup < 4; warmup += 1) {
    state = wrap(Math.imul(state, MULTIPLIER) + INCREMENT);
  }
  return () => {
    state = wrap(Math.imul(state, MULTIPLIER) + INCREMENT);
    return state / MODULUS;
  };
};
