const scratch = new Float64Array(1);
const words = new Uint32Array(scratch.buffer);
const HIGH = 1;
const SIGN = 2_147_483_648;

export const magnitudeWord = (value: number): number => {
  scratch[0] = value;
  return (words[HIGH] ?? 0) % SIGN;
};
