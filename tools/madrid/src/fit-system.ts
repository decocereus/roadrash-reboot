import type { Centreline, TrackStart } from "@racer/track/alignment";

export interface Source {
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly atM: Float64Array;
  readonly lengthM: number;
}

export interface Grid {
  readonly lengths: readonly number[];
  readonly knotS: Float64Array;
}

export interface Model {
  readonly start: TrackStart;
  readonly knots: Float64Array;
}

export interface Projection {
  readonly segment: Int32Array;
  readonly share: Float64Array;
  readonly normalX: Float64Array;
  readonly normalZ: Float64Array;
  readonly residual: Float64Array;
}

export interface NormalEquations {
  readonly matrix: Float64Array;
  readonly gradient: Float64Array;
}

interface Column {
  readonly tail: number;
  readonly firstRow: number;
  readonly tailRow: number;
  readonly near: Float64Array;
  readonly cx: number;
  readonly cz: number;
  readonly turn: number;
}

interface Sweep {
  readonly first: number;
  readonly tail: number;
  readonly dx: Float64Array;
  readonly dz: Float64Array;
  readonly turned: number;
}

interface SuffixSums {
  readonly outer: Float64Array;
  readonly weighted: Float64Array;
}

interface Reduced {
  readonly matrix: Float64Array;
  readonly rhs: Float64Array;
}

const START_WEIGHT = 10;
export const BOUND_TOLERANCE = 1e-12;

export const startGap = (
  source: Source,
  line: Centreline
): readonly [number, number] => [
  START_WEIGHT * ((line.worldX[0] ?? 0) - (source.x[0] ?? 0)),
  START_WEIGHT * ((line.worldZ[0] ?? 0) - (source.z[0] ?? 0)),
];

const hat = (grid: Grid, knot: number, s: number): number => {
  const before = grid.knotS[knot - 1] ?? 0;
  const at = grid.knotS[knot] ?? 0;
  const after = grid.knotS[knot + 1] ?? at;
  if (s <= before || s >= after) {
    return 0;
  }
  return s <= at ? (s - before) / (at - before) : (after - s) / (after - at);
};

const factorise = (matrix: Float64Array, size: number): Float64Array => {
  const factor = Float64Array.from(matrix);
  for (let column = 0; column < size; column += 1) {
    let diagonal = factor[column * size + column] ?? 0;
    for (let k = 0; k < column; k += 1) {
      const value = factor[column * size + k] ?? 0;
      diagonal -= value * value;
    }
    const root = Math.sqrt(Math.max(diagonal, 1e-300));
    factor[column * size + column] = root;
    for (let row = column + 1; row < size; row += 1) {
      let value = factor[row * size + column] ?? 0;
      for (let k = 0; k < column; k += 1) {
        value -=
          (factor[row * size + k] ?? 0) * (factor[column * size + k] ?? 0);
      }
      factor[row * size + column] = value / root;
    }
  }
  return factor;
};

const substitute = (
  factor: Float64Array,
  rhs: Float64Array,
  size: number
): Float64Array => {
  const solution = Float64Array.from(rhs);
  for (let row = 0; row < size; row += 1) {
    let value = solution[row] ?? 0;
    for (let k = 0; k < row; k += 1) {
      value -= (factor[row * size + k] ?? 0) * (solution[k] ?? 0);
    }
    solution[row] = value / (factor[row * size + row] ?? 1);
  }
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = solution[row] ?? 0;
    for (let k = row + 1; k < size; k += 1) {
      value -= (factor[k * size + row] ?? 0) * (solution[k] ?? 0);
    }
    solution[row] = value / (factor[row * size + row] ?? 1);
  }
  return solution;
};

export const solveSymmetric = (
  matrix: Float64Array,
  rhs: Float64Array
): Float64Array => substitute(factorise(matrix, rhs.length), rhs, rhs.length);

const firstRowFrom = (projection: Projection, sample: number): number => {
  let low = 0;
  let high = projection.segment.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((projection.segment[middle] ?? 0) < sample) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

const sweepOf = (grid: Grid, line: Centreline, knot: number): Sweep => {
  const first = Math.max(0, Math.floor(grid.knotS[knot - 1] ?? 0));
  const tail = Math.min(
    line.sampleCount - 1,
    Math.round(grid.knotS[knot + 1] ?? 0)
  );
  const dx = new Float64Array(tail - first + 2);
  const dz = new Float64Array(tail - first + 2);
  let turned = 0;
  let previousHat = hat(grid, knot, first);
  for (let at = first + 1; at <= tail; at += 1) {
    const currentHat = hat(grid, knot, at);
    const before = turned;
    turned += (previousHat + currentHat) / 2;
    previousHat = currentHat;
    const mid = (before + turned) / 2;
    const stepX = (line.worldX[at] ?? 0) - (line.worldX[at - 1] ?? 0);
    const stepZ = (line.worldZ[at] ?? 0) - (line.worldZ[at - 1] ?? 0);
    dx[at - first] = (dx[at - first - 1] ?? 0) - stepZ * mid;
    dz[at - first] = (dz[at - first - 1] ?? 0) + stepX * mid;
  }
  return { dx, dz, first, tail, turned };
};

const knotColumn = (
  grid: Grid,
  line: Centreline,
  projection: Projection,
  knot: number
): Column => {
  const { dx, dz, first, tail, turned } = sweepOf(grid, line, knot);
  const firstRow = firstRowFrom(projection, first);
  const tailRow = firstRowFrom(projection, tail);
  const near = new Float64Array(tailRow - firstRow);
  for (let row = firstRow; row < tailRow; row += 1) {
    const at = (projection.segment[row] ?? 0) - first;
    const share = projection.share[row] ?? 0;
    near[row - firstRow] =
      (projection.normalX[row] ?? 0) *
        ((dx[at] ?? 0) * (1 - share) + (dx[at + 1] ?? 0) * share) +
      (projection.normalZ[row] ?? 0) *
        ((dz[at] ?? 0) * (1 - share) + (dz[at + 1] ?? 0) * share);
  }
  const end = tail - first;
  return {
    cx: (dx[end] ?? 0) + turned * (line.worldZ[tail] ?? 0),
    cz: (dz[end] ?? 0) - turned * (line.worldX[tail] ?? 0),
    firstRow,
    near,
    tail,
    tailRow,
    turn: turned,
  };
};

const columnsOf = (
  grid: Grid,
  line: Centreline,
  projection: Projection
): Column[] => {
  const empty = new Float64Array(0);
  const whole = { firstRow: 0, near: empty, tail: 0, tailRow: 0 };
  const columns: Column[] = [
    { ...whole, cx: 1, cz: 0, turn: 0 },
    { ...whole, cx: 0, cz: 1, turn: 0 },
    { ...whole, cx: line.worldZ[0] ?? 0, cz: -(line.worldX[0] ?? 0), turn: 1 },
  ];
  for (let knot = 1; knot < grid.knotS.length - 1; knot += 1) {
    columns.push(knotColumn(grid, line, projection, knot));
  }
  return columns;
};

const rowFeatures = (
  line: Centreline,
  projection: Projection
): Float64Array => {
  const rows = projection.residual.length;
  const features = new Float64Array(rows * 3);
  for (let row = 0; row < rows; row += 1) {
    const at = projection.segment[row] ?? 0;
    const share = projection.share[row] ?? 0;
    const x =
      (line.worldX[at] ?? 0) * (1 - share) + (line.worldX[at + 1] ?? 0) * share;
    const z =
      (line.worldZ[at] ?? 0) * (1 - share) + (line.worldZ[at + 1] ?? 0) * share;
    const nx = projection.normalX[row] ?? 0;
    const nz = projection.normalZ[row] ?? 0;
    features[row * 3] = nx;
    features[row * 3 + 1] = nz;
    features[row * 3 + 2] = nz * x - nx * z;
  }
  return features;
};

const entryOf = (
  column: Column,
  features: Float64Array,
  row: number
): number => {
  if (row >= column.tailRow) {
    return (
      (features[row * 3] ?? 0) * column.cx +
      (features[row * 3 + 1] ?? 0) * column.cz +
      (features[row * 3 + 2] ?? 0) * column.turn
    );
  }
  return row >= column.firstRow ? (column.near[row - column.firstRow] ?? 0) : 0;
};

const suffixSums = (
  features: Float64Array,
  residuals: Float64Array
): SuffixSums => {
  const rows = residuals.length;
  const outer = new Float64Array((rows + 1) * 9);
  const weighted = new Float64Array((rows + 1) * 3);
  for (let row = rows - 1; row >= 0; row -= 1) {
    const residual = residuals[row] ?? 0;
    for (let i = 0; i < 3; i += 1) {
      const fi = features[row * 3 + i] ?? 0;
      weighted[row * 3 + i] =
        (weighted[(row + 1) * 3 + i] ?? 0) + fi * residual;
      for (let j = 0; j < 3; j += 1) {
        outer[row * 9 + i * 3 + j] =
          (outer[(row + 1) * 9 + i * 3 + j] ?? 0) +
          fi * (features[row * 3 + j] ?? 0);
      }
    }
  }
  return { outer, weighted };
};

const farBlock = (
  columns: readonly Column[],
  { outer, weighted }: SuffixSums
): NormalEquations => {
  const unknowns = columns.length;
  const matrix = new Float64Array(unknowns * unknowns);
  const gradient = new Float64Array(unknowns);
  for (const [a, left] of columns.entries()) {
    const from = left.tailRow * 3;
    gradient[a] =
      left.cx * (weighted[from] ?? 0) +
      left.cz * (weighted[from + 1] ?? 0) +
      left.turn * (weighted[from + 2] ?? 0);
    for (let b = a; b < unknowns; b += 1) {
      const right = columns[b];
      if (!right) {
        continue;
      }
      const base = right.tailRow * 9;
      const sx =
        (outer[base] ?? 0) * right.cx +
        (outer[base + 1] ?? 0) * right.cz +
        (outer[base + 2] ?? 0) * right.turn;
      const sz =
        (outer[base + 3] ?? 0) * right.cx +
        (outer[base + 4] ?? 0) * right.cz +
        (outer[base + 5] ?? 0) * right.turn;
      const st =
        (outer[base + 6] ?? 0) * right.cx +
        (outer[base + 7] ?? 0) * right.cz +
        (outer[base + 8] ?? 0) * right.turn;
      const value = left.cx * sx + left.cz * sz + left.turn * st;
      matrix[a * unknowns + b] = value;
      matrix[b * unknowns + a] = value;
    }
  }
  return { gradient, matrix };
};

const addNearBlock = (
  { gradient, matrix }: NormalEquations,
  columns: readonly Column[],
  features: Float64Array,
  residuals: Float64Array
): void => {
  const unknowns = columns.length;
  for (const [a, column] of columns.entries()) {
    for (let row = column.firstRow; row < column.tailRow; row += 1) {
      const ja = column.near[row - column.firstRow] ?? 0;
      if (ja === 0) {
        continue;
      }
      gradient[a] = (gradient[a] ?? 0) + ja * (residuals[row] ?? 0);
      for (const [b, other] of columns.entries()) {
        if (row < other.firstRow) {
          break;
        }
        const product = ja * entryOf(other, features, row);
        matrix[a * unknowns + b] = (matrix[a * unknowns + b] ?? 0) + product;
        if (row >= other.tailRow) {
          matrix[b * unknowns + a] = (matrix[b * unknowns + a] ?? 0) + product;
        }
      }
    }
  }
};

const addStartPin = (
  { gradient, matrix }: NormalEquations,
  [gx, gz]: readonly [number, number]
): void => {
  const unknowns = gradient.length;
  matrix[0] = (matrix[0] ?? 0) + START_WEIGHT * START_WEIGHT;
  matrix[unknowns + 1] =
    (matrix[unknowns + 1] ?? 0) + START_WEIGHT * START_WEIGHT;
  gradient[0] = (gradient[0] ?? 0) + START_WEIGHT * gx;
  gradient[1] = (gradient[1] ?? 0) + START_WEIGHT * gz;
};

const addSmoothing = (
  { gradient, matrix }: NormalEquations,
  knotValues: Float64Array,
  smoothing: number
): void => {
  const unknowns = gradient.length;
  const knots = knotValues.length;
  for (let knot = 1; knot < knots - 1; knot += 1) {
    const column = 2 + knot;
    const value = knotValues[knot] ?? 0;
    gradient[column] =
      (gradient[column] ?? 0) +
      smoothing *
        (2 * value - (knotValues[knot - 1] ?? 0) - (knotValues[knot + 1] ?? 0));
    matrix[column * unknowns + column] =
      (matrix[column * unknowns + column] ?? 0) + 2 * smoothing;
    if (knot + 1 < knots - 1) {
      matrix[column * unknowns + column + 1] =
        (matrix[column * unknowns + column + 1] ?? 0) - smoothing;
      matrix[(column + 1) * unknowns + column] =
        (matrix[(column + 1) * unknowns + column] ?? 0) - smoothing;
    }
  }
};

export const normalEquations = (
  grid: Grid,
  source: Source,
  line: Centreline,
  projection: Projection,
  model: Model,
  smoothing: number
): NormalEquations => {
  const columns = columnsOf(grid, line, projection);
  const features = rowFeatures(line, projection);
  const system = farBlock(columns, suffixSums(features, projection.residual));
  addNearBlock(system, columns, features, projection.residual);
  addStartPin(system, startGap(source, line));
  addSmoothing(system, model.knots, smoothing);
  return system;
};

const heldAtBound = (
  gradient: Float64Array,
  knots: Float64Array,
  bounds: Float64Array
): Float64Array => {
  const fixed = new Float64Array(gradient.length).fill(Number.NaN);
  for (let column = 3; column < gradient.length; column += 1) {
    const value = knots[column - 2] ?? 0;
    const bound = bounds[column - 2] ?? 0;
    const pull = gradient[column] ?? 0;
    if (
      (value >= bound - BOUND_TOLERANCE && pull < 0) ||
      (value <= -bound + BOUND_TOLERANCE && pull > 0)
    ) {
      fixed[column] = 0;
    }
  }
  return fixed;
};

const freeColumns = (fixed: Float64Array): number[] => {
  const free: number[] = [];
  for (let column = 0; column < fixed.length; column += 1) {
    if (Number.isNaN(fixed[column] ?? 0)) {
      free.push(column);
    }
  }
  return free;
};

const reducedSystem = (
  { gradient, matrix }: NormalEquations,
  fixed: Float64Array,
  free: readonly number[],
  damping: number
): Reduced => {
  const unknowns = gradient.length;
  const size = free.length;
  const reduced = new Float64Array(size * size);
  const rhs = new Float64Array(size);
  for (const [row, a] of free.entries()) {
    let value = -(gradient[a] ?? 0);
    for (let b = 0; b < unknowns; b += 1) {
      const step = fixed[b] ?? Number.NaN;
      if (!Number.isNaN(step)) {
        value -= (matrix[a * unknowns + b] ?? 0) * step;
      }
    }
    rhs[row] = value;
    for (const [column, b] of free.entries()) {
      const entry = matrix[a * unknowns + b] ?? 0;
      reduced[row * size + column] =
        a === b ? entry * (1 + damping) + damping * 1e-6 : entry;
    }
  }
  return { matrix: reduced, rhs };
};

const stepFrom = (
  fixed: Float64Array,
  free: readonly number[],
  solved: Float64Array
): Float64Array => {
  const step = new Float64Array(fixed.length);
  for (let column = 0; column < fixed.length; column += 1) {
    const held = fixed[column] ?? Number.NaN;
    step[column] = Number.isNaN(held) ? 0 : held;
  }
  for (const [row, column] of free.entries()) {
    step[column] = solved[row] ?? 0;
  }
  return step;
};

const clipAtBound = (
  step: Float64Array,
  free: readonly number[],
  knots: Float64Array,
  bounds: Float64Array,
  fixed: Float64Array
): boolean => {
  let clipped = false;
  for (const column of free) {
    if (column < 3) {
      continue;
    }
    const value = knots[column - 2] ?? 0;
    const bound = bounds[column - 2] ?? 0;
    const next = value + (step[column] ?? 0);
    if (Math.abs(next) > bound) {
      fixed[column] = Math.sign(next) * bound - value;
      clipped = true;
    }
  }
  return clipped;
};

export const boundedStep = (
  system: NormalEquations,
  knots: Float64Array,
  bounds: Float64Array,
  damping: number
): Float64Array => {
  const fixed = heldAtBound(system.gradient, knots, bounds);
  for (;;) {
    const free = freeColumns(fixed);
    const reduced = reducedSystem(system, fixed, free, damping);
    const step = stepFrom(
      fixed,
      free,
      substitute(
        factorise(reduced.matrix, free.length),
        reduced.rhs,
        free.length
      )
    );
    if (!clipAtBound(step, free, knots, bounds, fixed)) {
      return step;
    }
  }
};
