import type { Centreline } from "@racer/track/alignment";

export const smoothRoad = {
  curvatureFlipsPerKilometre: 3,
  gradeChangeFlipsPerKilometre: 7,
  gradeChangePerMetre: 0.006,
} as const;

const STRAIGHT_CURVATURE = 1 / 1000;
const LEVEL_GRADE_CHANGE = 1 / 10_000;

const flipsPerKilometre = (
  values: Float64Array,
  quiet: number,
  lengthM: number
): number => {
  let flips = 0;
  let side = 0;
  for (const value of values) {
    if (Math.abs(value) >= quiet) {
      const sign = Math.sign(value);
      flips += side !== 0 && sign !== side ? 1 : 0;
      side = sign;
    }
  }
  return (flips * 1000) / lengthM;
};

export const curvatureFlipsPerKilometre = (line: Centreline): number =>
  flipsPerKilometre(line.curvature, STRAIGHT_CURVATURE, line.length);

export const gradeChangeFlipsPerKilometre = (line: Centreline): number =>
  flipsPerKilometre(line.slopeRate, LEVEL_GRADE_CHANGE, line.length);

export const sharpestGradeChange = (line: Centreline): number =>
  line.slopeRate.reduce(
    (sharpest, rate) => Math.max(sharpest, Math.abs(rate)),
    0
  );
