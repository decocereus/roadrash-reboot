import { HASH_WORDS } from "./snapshot-format.ts";

const MIX_1 = 2_654_435_761;
const MIX_2 = 1_597_334_677;
const MIX_3 = 3_266_489_917;
const MIX_4 = 668_265_263;
const SEED_1 = 1_779_033_703;
const SEED_2 = 374_761_393;
const SEED_3 = 1_013_904_223;
const SEED_4 = 668_265_263;
const HALF_WORD = 1 / 65_536;
const FINAL_ROUNDS = 2;
const WORD_BYTES = 4;
const HEX_PER_WORD = 8;
const HEX_RADIX = 16;

const lanes = { h1: 0, h2: 0, h3: 0, h4: 0 };

const eat = (term: number): void => {
  lanes.h1 = Math.imul(
    lanes.h1 + Math.trunc(lanes.h1 * HALF_WORD) + term,
    MIX_1
  );
  lanes.h2 = Math.imul(
    lanes.h2 + Math.trunc(lanes.h2 * HALF_WORD) + term,
    MIX_2
  );
  lanes.h3 = Math.imul(
    lanes.h3 + Math.trunc(lanes.h3 * HALF_WORD) + term,
    MIX_3
  );
  lanes.h4 = Math.imul(
    lanes.h4 + Math.trunc(lanes.h4 * HALF_WORD) + term,
    MIX_4
  );
};

export const hashBytes = (
  bytes: DataView,
  from: number,
  count: number,
  into: Uint32Array
): void => {
  lanes.h1 = SEED_1;
  lanes.h2 = SEED_2;
  lanes.h3 = SEED_3;
  lanes.h4 = SEED_4;
  const whole = count - (count % WORD_BYTES);
  for (let at = from; at < from + whole; at += WORD_BYTES) {
    eat(bytes.getUint32(at, true));
  }
  for (let at = from + whole; at < from + count; at += 1) {
    eat(bytes.getUint8(at));
  }
  eat(count);
  const crossed = lanes.h1 + lanes.h2 + lanes.h3 + lanes.h4;
  for (let round = 0; round < FINAL_ROUNDS; round += 1) {
    eat(crossed);
  }
  into[0] = lanes.h1;
  into[1] = lanes.h2;
  into[2] = lanes.h3;
  into[3] = lanes.h4;
};

export const hashText = (hash: Uint32Array): string => {
  let written = "";
  for (let word = 0; word < HASH_WORDS; word += 1) {
    written += (hash[word] ?? 0)
      .toString(HEX_RADIX)
      .padStart(HEX_PER_WORD, "0");
  }
  return written;
};
