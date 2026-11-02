export type Random = () => number;

const MODULUS = 4_294_967_296;
const MULTIPLIER = 1_664_525;
const INCREMENT = 1_013_904_223;

const wrap = (value: number): number => ((value % MODULUS) + MODULUS) % MODULUS;

export const nextSeed = (seed: number): number =>
  wrap(Math.imul(seed, MULTIPLIER) + INCREMENT);

export const unitOf = (seed: number): number => seed / MODULUS;

export const siteSeed = (seed: number, site: string): number => {
  let mixed = wrap(seed);
  for (let index = 0; index < site.length; index += 1) {
    mixed = nextSeed(mixed + (site.codePointAt(index) ?? 0));
  }
  return mixed;
};

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
