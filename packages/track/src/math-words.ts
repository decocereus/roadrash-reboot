const scratch = new Float64Array(1);
const words = new Uint32Array(scratch.buffer);
const HIGH = 1;
const SIGN = 2_147_483_648;
const ONE_HIGH_WORD = 1_072_693_248;

const checkByteOrder = (): void => {
  scratch[0] = 1;
  if (words[HIGH] !== ONE_HIGH_WORD) {
    throw new RangeError(
      "The track maths reads the high word of a float64 at index 1, which only holds on a little-endian engine, and this engine stores the words the other way round."
    );
  }
};

checkByteOrder();

export const magnitudeWord = (value: number): number => {
  scratch[0] = value;
  return (words[HIGH] ?? 0) % SIGN;
};
