import { solveSymmetric } from "./fit-system.ts";

interface GradeSample {
  readonly s: number;
  readonly groundM: number;
}

export interface GradeOptions {
  readonly knotS: Float64Array;
  readonly samples: readonly GradeSample[];
}

export interface Grades {
  readonly knots: Float64Array;
  readonly offset: number;
  readonly rmsM: number;
  readonly maxM: number;
  readonly maxStepPerMetre: number;
}

const SLOPE_SMOOTHING = 2000;

const heightRow = (
  knotS: Float64Array,
  s: number,
  unknowns: number
): Float64Array => {
  const row = new Float64Array(unknowns);
  const pieces = knotS.length - 1;
  const add = (knot: number, weight: number): void => {
    if (knot >= 1 && knot <= pieces - 1) {
      row[knot - 1] = (row[knot - 1] ?? 0) + weight;
    }
  };
  for (let piece = 0; piece < pieces; piece += 1) {
    const from = knotS[piece] ?? 0;
    const to = knotS[piece + 1] ?? from;
    const length = to - from;
    if (s >= to) {
      add(piece, length / 2);
      add(piece + 1, length / 2);
    } else if (s > from) {
      const t = s - from;
      add(piece, t - (t * t) / (2 * length));
      add(piece + 1, (t * t) / (2 * length));
    }
  }
  row[unknowns - 1] = 1;
  return row;
};

const addSamples = (
  normal: Float64Array,
  rhs: Float64Array,
  rows: readonly Float64Array[],
  samples: readonly GradeSample[]
): void => {
  const unknowns = rhs.length;
  for (const [index, row] of rows.entries()) {
    const target = samples[index]?.groundM ?? 0;
    for (let a = 0; a < unknowns; a += 1) {
      const weight = row[a] ?? 0;
      rhs[a] = (rhs[a] ?? 0) + weight * target;
      for (let b = 0; b < unknowns; b += 1) {
        normal[a * unknowns + b] =
          (normal[a * unknowns + b] ?? 0) + weight * (row[b] ?? 0);
      }
    }
  }
};

const addSlopeSmoothing = (
  normal: Float64Array,
  unknowns: number,
  grades: number,
  smoothing: number
): void => {
  for (let knot = 0; knot <= grades; knot += 1) {
    const columns = [knot - 1, knot].filter(
      (column) => column >= 0 && column < grades
    );
    for (const a of columns) {
      for (const b of columns) {
        normal[a * unknowns + b] =
          (normal[a * unknowns + b] ?? 0) + (a === b ? smoothing : -smoothing);
      }
    }
  }
};

const missesOf = (
  rows: readonly Float64Array[],
  samples: readonly GradeSample[],
  solved: Float64Array
): Pick<Grades, "maxM" | "rmsM"> => {
  let squares = 0;
  let worst = 0;
  for (const [index, row] of rows.entries()) {
    let height = 0;
    for (let a = 0; a < solved.length; a += 1) {
      height += (row[a] ?? 0) * (solved[a] ?? 0);
    }
    const miss = Math.abs(height - (samples[index]?.groundM ?? 0));
    squares += miss * miss;
    worst = Math.max(worst, miss);
  }
  return {
    maxM: worst,
    rmsM: Math.sqrt(squares / Math.max(1, samples.length)),
  };
};

export const fitGrades = ({ knotS, samples }: GradeOptions): Grades => {
  const unknowns = knotS.length - 1;
  const normal = new Float64Array(unknowns * unknowns);
  const rhs = new Float64Array(unknowns);
  const rows = samples.map((sample) => heightRow(knotS, sample.s, unknowns));
  addSamples(normal, rhs, rows, samples);
  addSlopeSmoothing(normal, unknowns, unknowns - 1, SLOPE_SMOOTHING);
  const solved = solveSymmetric(normal, rhs);
  const knots = new Float64Array(knotS.length);
  for (let knot = 1; knot < knotS.length - 1; knot += 1) {
    knots[knot] = solved[knot - 1] ?? 0;
  }
  let maxStepPerMetre = 0;
  for (let knot = 1; knot < knotS.length; knot += 1) {
    const length = (knotS[knot] ?? 0) - (knotS[knot - 1] ?? 0);
    const step = (knots[knot] ?? 0) - (knots[knot - 1] ?? 0);
    maxStepPerMetre = Math.max(maxStepPerMetre, Math.abs(step) / length);
  }
  const misses = missesOf(rows, samples, solved);
  return {
    knots,
    maxM: misses.maxM,
    maxStepPerMetre,
    offset: solved[unknowns - 1] ?? 0,
    rmsM: misses.rmsM,
  };
};
