import { describe, expect, it } from "vitest";

import golden from "../test/math-golden.json" with { type: "json" };
import { magnitudeWord } from "./math-words.ts";
import { atan, cos, hypot2, sin } from "./math.ts";
import { createRandom } from "./random.ts";
import type { Random } from "./random.ts";

const CORPUS_SIZE = 100_000;
const DIGEST_MODULUS = 2_147_483_647;

const bits = new DataView(new ArrayBuffer(8));

const valueOf = (hex: string): number => {
  bits.setBigUint64(0, BigInt(`0x${hex}`));
  return bits.getFloat64(0);
};

const seen = (value: number): string => {
  if (Number.isNaN(value)) {
    return "nan";
  }
  bits.setFloat64(0, value);
  return bits.getBigUint64(0).toString(16).padStart(16, "0");
};

const digestOf = (values: readonly number[]): string => {
  let first = 0;
  let second = 0;
  for (const value of values) {
    bits.setFloat64(0, value);
    for (let at = 0; at < 8; at += 2) {
      const chunk = bits.getUint16(at);
      first = (first * 65_599 + chunk) % DIGEST_MODULUS;
      second = (second * 40_503 + chunk) % DIGEST_MODULUS;
    }
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
};

const drawUnit = (random: Random): number =>
  (Math.floor(random() * 4_294_967_296) * 2_097_152 +
    Math.floor(random() * 2_097_152)) /
  9_007_199_254_740_992;

const powerOfTwo = (exponent: number): number => {
  let value = 1;
  for (let step = 0; step < exponent; step += 1) {
    value *= 2;
  }
  for (let step = 0; step > exponent; step -= 1) {
    value /= 2;
  }
  return value;
};

const spread = (random: Random, least: number, span: number): number => {
  const sign = random() < 0.5 ? -1 : 1;
  const exponent = least + Math.floor(random() * span);
  return sign * (1 + drawUnit(random)) * powerOfTwo(exponent);
};

const angles = (seed: number): number[] => {
  const random = createRandom(seed);
  return Array.from({ length: CORPUS_SIZE }, (_, index) => {
    const lane = index % 4;
    if (lane === 0) {
      return (drawUnit(random) * 2 - 1) * Math.PI;
    }
    if (lane === 1) {
      return drawUnit(random) * 2600;
    }
    if (lane === 2) {
      return (drawUnit(random) * 2 - 1) * 300;
    }
    return spread(random, -30, 50);
  });
};

const ratios = (seed: number): number[] => {
  const random = createRandom(seed);
  return Array.from({ length: CORPUS_SIZE }, (_, index) => {
    const lane = index % 3;
    if (lane === 0) {
      return (drawUnit(random) * 2 - 1) * 1.62;
    }
    if (lane === 1) {
      return (drawUnit(random) * 2 - 1) * 4;
    }
    return spread(random, -35, 105);
  });
};

const lengths = (seed: number): number[] => {
  const random = createRandom(seed);
  return Array.from({ length: CORPUS_SIZE }, (_, index) => {
    const reach = index % 2 === 0 ? 1_000_000 : 20;
    return hypot2(
      (drawUnit(random) * 2 - 1) * reach,
      (drawUnit(random) * 2 - 1) * 20
    );
  });
};

const unary = { atan, cos, sin } as const;

describe("owned math", () => {
  it("reads a float64's high word from Uint32 index 1 on this host", () => {
    expect([1, -2, 0.5, Math.PI, -Infinity].map(magnitudeWord)).toStrictEqual([
      0x3f_f0_00_00, 0x40_00_00_00, 0x3f_e0_00_00, 0x40_09_21_fb, 0x7f_f0_00_00,
    ]);
  });

  it("returns the oracle bits for every golden sin, cos and atan vector", () => {
    for (const name of ["sin", "cos", "atan"] as const) {
      const vectors = golden[name];
      expect(vectors.length).toBeGreaterThan(900);
      expect(
        vectors.filter(
          ([input = "", output = ""]) =>
            seen(unary[name](valueOf(input))) !== output
        )
      ).toStrictEqual([]);
    }
  });

  it("returns the oracle bits for every golden hypot2 vector", () => {
    expect(golden.hypot2.length).toBeGreaterThan(900);
    expect(
      golden.hypot2.filter(
        ([along = "", across = "", output = ""]) =>
          seen(hypot2(valueOf(along), valueOf(across))) !== output
      )
    ).toStrictEqual([]);
  });

  it("hashes a seeded 100,000-input corpus per function to the committed digests", () => {
    expect({
      atan: digestOf(ratios(golden.seeds.atan).map(atan)),
      cos: digestOf(angles(golden.seeds.cos).map(cos)),
      hypot2: digestOf(lengths(golden.seeds.hypot2)),
      sin: digestOf(angles(golden.seeds.sin).map(sin)),
    }).toStrictEqual(golden.digests);
  });
});
