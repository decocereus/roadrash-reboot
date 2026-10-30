import { HASH_WORDS } from "./snapshot-bytes.ts";

const C1 = 0x23_9b_96_1b;
const C2 = 0xab_0e_97_89;
const C3 = 0x38_b3_4a_e5;
const C4 = 0xa1_e3_8b_93;
const R1 = 0x56_1c_cd_1b;
const R2 = 0x0b_ca_a7_47;
const R3 = 0x96_cd_1c_35;
const R4 = 0x32_ac_3b_17;
const F1 = 0x85_eb_ca_6b;
const F2 = 0xc2_b2_ae_35;
const BLOCK_BYTES = 16;
const WORD_BYTES = 4;
const BYTE_BITS = 8;
const WORD_BITS = 32;
const FIVE = 5;
const HEX_PER_WORD = 8;
const HEX_RADIX = 16;

const lanes = { h1: 0, h2: 0, h3: 0, h4: 0 };
const tail = { k1: 0, k2: 0, k3: 0, k4: 0 };

const wrap = (word: number): number => Math.imul(word, 1);

const turn = (word: number, by: number): number =>
  (word << by) | (word >>> (WORD_BITS - by));

const spread = (word: number): number => {
  let mixed = word;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, F1);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, F2);
  mixed ^= mixed >>> 16;
  return mixed;
};

const eatBlock = (bytes: DataView, at: number): void => {
  const k1 = bytes.getUint32(at, true);
  const k2 = bytes.getUint32(at + WORD_BYTES, true);
  const k3 = bytes.getUint32(at + 2 * WORD_BYTES, true);
  const k4 = bytes.getUint32(at + 3 * WORD_BYTES, true);
  lanes.h1 ^= Math.imul(turn(Math.imul(k1, C1), 15), C2);
  lanes.h1 = Math.imul(turn(lanes.h1, 19) + lanes.h2, FIVE) + R1;
  lanes.h2 ^= Math.imul(turn(Math.imul(k2, C2), 16), C3);
  lanes.h2 = Math.imul(turn(lanes.h2, 17) + lanes.h3, FIVE) + R2;
  lanes.h3 ^= Math.imul(turn(Math.imul(k3, C3), 17), C4);
  lanes.h3 = Math.imul(turn(lanes.h3, 15) + lanes.h4, FIVE) + R3;
  lanes.h4 ^= Math.imul(turn(Math.imul(k4, C4), 18), C1);
  lanes.h4 = Math.imul(turn(lanes.h4, 13) + lanes.h1, FIVE) + R4;
};

const eatTail = (bytes: DataView, at: number, left: number): void => {
  tail.k1 = 0;
  tail.k2 = 0;
  tail.k3 = 0;
  tail.k4 = 0;
  for (let index = 0; index < left; index += 1) {
    const byte = bytes.getUint8(at + index);
    const shift = BYTE_BITS * (index % WORD_BYTES);
    switch (Math.trunc(index / WORD_BYTES)) {
      case 0: {
        tail.k1 |= byte << shift;
        break;
      }
      case 1: {
        tail.k2 |= byte << shift;
        break;
      }
      case 2: {
        tail.k3 |= byte << shift;
        break;
      }
      default: {
        tail.k4 |= byte << shift;
        break;
      }
    }
  }
  lanes.h4 ^= Math.imul(turn(Math.imul(tail.k4, C4), 18), C1);
  lanes.h3 ^= Math.imul(turn(Math.imul(tail.k3, C3), 17), C4);
  lanes.h2 ^= Math.imul(turn(Math.imul(tail.k2, C2), 16), C3);
  lanes.h1 ^= Math.imul(turn(Math.imul(tail.k1, C1), 15), C2);
};

const finish = (count: number): void => {
  lanes.h1 ^= count;
  lanes.h2 ^= count;
  lanes.h3 ^= count;
  lanes.h4 ^= count;
  lanes.h1 = wrap(lanes.h1 + lanes.h2 + lanes.h3 + lanes.h4);
  lanes.h2 = wrap(lanes.h2 + lanes.h1);
  lanes.h3 = wrap(lanes.h3 + lanes.h1);
  lanes.h4 = wrap(lanes.h4 + lanes.h1);
  lanes.h1 = spread(lanes.h1);
  lanes.h2 = spread(lanes.h2);
  lanes.h3 = spread(lanes.h3);
  lanes.h4 = spread(lanes.h4);
  lanes.h1 = wrap(lanes.h1 + lanes.h2 + lanes.h3 + lanes.h4);
  lanes.h2 = wrap(lanes.h2 + lanes.h1);
  lanes.h3 = wrap(lanes.h3 + lanes.h1);
  lanes.h4 = wrap(lanes.h4 + lanes.h1);
};

export const hashBytes = (
  bytes: DataView,
  from: number,
  count: number,
  into: Uint32Array
): void => {
  lanes.h1 = 0;
  lanes.h2 = 0;
  lanes.h3 = 0;
  lanes.h4 = 0;
  const blocks = count - (count % BLOCK_BYTES);
  for (let at = from; at < from + blocks; at += BLOCK_BYTES) {
    eatBlock(bytes, at);
  }
  if (blocks < count) {
    eatTail(bytes, from + blocks, count - blocks);
  }
  finish(count);
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
