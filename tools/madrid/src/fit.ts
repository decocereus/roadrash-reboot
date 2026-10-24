import { sampleAlignment } from "@racer/track/alignment";
import type {
  Centreline,
  TrackPiece,
  TrackPieces,
  TrackStart,
} from "@racer/track/alignment";
import type { Position } from "@racer/track/madrid-schema";

import {
  BOUND_TOLERANCE,
  boundedStep,
  normalEquations,
  startGap,
} from "./fit-system.ts";
import type { Grid, Model, Projection, Source } from "./fit-system.ts";

export interface SlowPlace {
  readonly fromM: number;
  readonly toM: number;
  readonly minRadiusM: number;
}

export interface FitOptions {
  readonly minRadiusM: number;
  readonly slowPlaces: readonly SlowPlace[];
  readonly pieceLengthM: number;
  readonly smoothing: number;
}

interface FitError {
  readonly rmsM: number;
  readonly p95M: number;
  readonly maxM: number;
}

export interface ForcedSpan {
  readonly fromM: number;
  readonly toM: number;
  readonly maxErrorM: number;
}

export interface Fit {
  readonly start: TrackStart;
  readonly pieces: TrackPieces;
  readonly lengthM: number;
  readonly sourceLengthM: number;
  readonly error: FitError;
  readonly minRadiusM: number;
  readonly forced: readonly ForcedSpan[];
  readonly deviationM: Float64Array;
}

const ADVANCE = 4;
const WARM_ITERATIONS = 40;
const SETTLE_ITERATIONS = 200;
const MAX_CYCLES = 8;
const SETTLED = 1e-7;

const resample = (line: readonly Position[]): Source => {
  const cumulative = [0];
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    if (a && b) {
      cumulative.push(
        (cumulative.at(-1) ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1])
      );
    }
  }
  const lengthM = cumulative.at(-1) ?? 0;
  if (lengthM < 2) {
    throw new Error("A polyline needs at least 2 m to fit.");
  }
  const whole = Math.floor(lengthM);
  const count = whole + (lengthM > whole ? 2 : 1);
  const x = new Float64Array(count);
  const z = new Float64Array(count);
  const atM = new Float64Array(count);
  let segment = 1;
  for (let index = 0; index < count; index += 1) {
    const at = Math.min(index, lengthM);
    while (segment < line.length - 1 && (cumulative[segment] ?? 0) < at) {
      segment += 1;
    }
    const a = line[segment - 1] ?? [0, 0];
    const b = line[segment] ?? a;
    const from = cumulative[segment - 1] ?? 0;
    const span = (cumulative[segment] ?? from) - from;
    const share = span > 0 ? (at - from) / span : 0;
    x[index] = a[0] + (b[0] - a[0]) * share;
    z[index] = -(a[1] + (b[1] - a[1]) * share);
    atM[index] = at;
  }
  return { atM, lengthM, x, z };
};

const gridOf = (lengthM: number, pieceLengthM: number): Grid => {
  const lengths: number[] = [];
  let covered = 0;
  while (covered < lengthM) {
    const length = Math.min(pieceLengthM, lengthM - covered);
    lengths.push(length);
    covered += length;
  }
  const knotS = new Float64Array(lengths.length + 1);
  for (const [index, length] of lengths.entries()) {
    knotS[index + 1] = (knotS[index] ?? 0) + length;
  }
  return { knotS, lengths };
};

const curvatureLimit = (minRadiusM: number): number =>
  minRadiusM > 0 ? 1 / minRadiusM : Number.POSITIVE_INFINITY;

const boundsOf = (
  grid: Grid,
  source: Source,
  options: FitOptions
): Float64Array => {
  const roadLength = grid.knotS.at(-1) ?? 1;
  return Float64Array.from(grid.knotS, (knotS) => {
    const atM = (knotS / roadLength) * source.lengthM;
    const place = options.slowPlaces.find(
      ({ fromM, toM }) => atM >= fromM && atM <= toM
    );
    return curvatureLimit(place?.minRadiusM ?? options.minRadiusM);
  });
};

const piecesOf = (grid: Grid, knots: Float64Array): TrackPieces => {
  const pieces = grid.lengths.map((length, index): TrackPiece => ({
    easedClimb: 0,
    easedTurn: 0,
    endCurvature: knots[index + 1] ?? 0,
    endGrade: 0,
    length,
  }));
  const [first, ...rest] = pieces;
  if (!first) {
    throw new Error("A fit needs at least one piece.");
  }
  return [first, ...rest];
};

const centrelineOf = (grid: Grid, model: Model): Centreline =>
  sampleAlignment({
    leadInLength: 0,
    pieces: piecesOf(grid, model.knots),
    runoffLength: 0,
    start: model.start,
  });

const project = (source: Source, line: Centreline): Projection => {
  const count = source.x.length;
  const segment = new Int32Array(count);
  const share = new Float64Array(count);
  const normalX = new Float64Array(count);
  const normalZ = new Float64Array(count);
  const residual = new Float64Array(count);
  const last = line.sampleCount - 2;
  let from = 0;
  for (let index = 0; index < count; index += 1) {
    const qx = source.x[index] ?? 0;
    const qz = source.z[index] ?? 0;
    let best = Number.POSITIVE_INFINITY;
    let bestAt = from;
    for (let at = from; at <= Math.min(last, from + ADVANCE); at += 1) {
      const ax = line.worldX[at] ?? 0;
      const az = line.worldZ[at] ?? 0;
      const dx = (line.worldX[at + 1] ?? ax) - ax;
      const dz = (line.worldZ[at + 1] ?? az) - az;
      const along = Math.min(
        1,
        Math.max(0, ((qx - ax) * dx + (qz - az) * dz) / (dx * dx + dz * dz))
      );
      const fx = ax + dx * along - qx;
      const fz = az + dz * along - qz;
      const gap = fx * fx + fz * fz;
      if (gap < best) {
        best = gap;
        bestAt = at;
        const size = Math.hypot(dx, dz);
        segment[index] = at;
        share[index] = along;
        normalX[index] = -dz / size;
        normalZ[index] = dx / size;
        residual[index] = (-dz * fx + dx * fz) / size;
      }
    }
    from = bestAt;
  }
  return { normalX, normalZ, residual, segment, share };
};

const alongArc = (source: Source, line: Centreline): Projection => {
  const count = source.x.length;
  const rows = 2 * count;
  const segment = new Int32Array(rows);
  const share = new Float64Array(rows);
  const normalX = new Float64Array(rows);
  const normalZ = new Float64Array(rows);
  const residual = new Float64Array(rows);
  const scale = (line.sampleCount - 1) / source.lengthM;
  for (let index = 0; index < count; index += 1) {
    const at = Math.min(
      line.sampleCount - 1 - 1e-9,
      (source.atM[index] ?? 0) * scale
    );
    const whole = Math.floor(at);
    const part = at - whole;
    const px =
      (line.worldX[whole] ?? 0) * (1 - part) +
      (line.worldX[whole + 1] ?? 0) * part;
    const pz =
      (line.worldZ[whole] ?? 0) * (1 - part) +
      (line.worldZ[whole + 1] ?? 0) * part;
    for (const [offset, x, z, gap] of [
      [0, 1, 0, px - (source.x[index] ?? 0)],
      [1, 0, 1, pz - (source.z[index] ?? 0)],
    ] as const) {
      const row = 2 * index + offset;
      segment[row] = whole;
      share[row] = part;
      normalX[row] = x;
      normalZ[row] = z;
      residual[row] = gap;
    }
  }
  return { normalX, normalZ, residual, segment, share };
};

type Correspond = (source: Source, line: Centreline) => Projection;

const roughness = (knots: Float64Array): number => {
  let total = 0;
  for (let index = 1; index < knots.length; index += 1) {
    const change = (knots[index] ?? 0) - (knots[index - 1] ?? 0);
    total += change * change;
  }
  return total;
};

const costOf = (
  source: Source,
  line: Centreline,
  projection: Projection,
  model: Model,
  smoothing: number
): number => {
  let total = 0;
  for (const value of projection.residual) {
    total += value * value;
  }
  const [gx, gz] = startGap(source, line);
  return total + gx * gx + gz * gz + smoothing * roughness(model.knots);
};

const advance = (model: Model, step: Float64Array): Model => {
  const knots = Float64Array.from(model.knots);
  for (let knot = 1; knot < knots.length - 1; knot += 1) {
    knots[knot] = (knots[knot] ?? 0) + (step[2 + knot] ?? 0);
  }
  return {
    knots,
    start: {
      heading: model.start.heading + (step[2] ?? 0),
      x: model.start.x + (step[0] ?? 0),
      z: model.start.z + (step[1] ?? 0),
    },
  };
};

const initialModel = (source: Source, grid: Grid): Model => {
  const headings: number[] = [];
  for (let index = 1; index < source.x.length; index += 1) {
    const dx = (source.x[index] ?? 0) - (source.x[index - 1] ?? 0);
    const dz = (source.z[index] ?? 0) - (source.z[index - 1] ?? 0);
    const raw = Math.atan2(dx, -dz);
    const previous = headings.at(-1) ?? raw;
    headings.push(
      raw + 2 * Math.PI * Math.round((previous - raw) / (2 * Math.PI))
    );
  }
  const headingAt = (s: number): number => {
    const index = Math.min(headings.length - 1, Math.max(0, Math.round(s)));
    return headings[index] ?? 0;
  };
  const knots = new Float64Array(grid.knotS.length);
  for (let knot = 1; knot < knots.length - 1; knot += 1) {
    const before = grid.knotS[knot - 1] ?? 0;
    const after = grid.knotS[knot + 1] ?? before;
    const turn = headingAt(after) - headingAt(before);
    knots[knot] = turn / (after - before);
  }
  return {
    knots,
    start: {
      heading: headingAt(0),
      x: source.x[0] ?? 0,
      z: source.z[0] ?? 0,
    },
  };
};

const clampKeepingTurn = (model: Model, bounds: Float64Array): Model => {
  const knots = Float64Array.from(model.knots);
  const last = knots.length - 1;
  let carry = 0;
  for (let knot = 1; knot < last; knot += 1) {
    const bound = bounds[knot] ?? 0;
    const wanted = (knots[knot] ?? 0) + carry;
    const held = Math.max(-bound, Math.min(bound, wanted));
    knots[knot] = held;
    carry = wanted - held;
  }
  for (let knot = last - 1; knot >= 1 && carry !== 0; knot -= 1) {
    const bound = bounds[knot] ?? 0;
    const wanted = (knots[knot] ?? 0) + carry;
    const held = Math.max(-bound, Math.min(bound, wanted));
    knots[knot] = held;
    carry = wanted - held;
  }
  return { knots, start: model.start };
};

interface Solved {
  readonly model: Model;
  readonly line: Centreline;
  readonly projection: Projection;
}

const solve = (
  source: Source,
  grid: Grid,
  first: Model,
  options: FitOptions,
  bounds: Float64Array,
  correspond: Correspond,
  limit: number
): Solved => {
  let model = first;
  let line = centrelineOf(grid, model);
  let projection = correspond(source, line);
  let cost = costOf(source, line, projection, model, options.smoothing);
  let damping = 1e-3;
  for (let iteration = 0; iteration < limit; iteration += 1) {
    const system = normalEquations(
      grid,
      source,
      line,
      projection,
      model,
      options.smoothing
    );
    let accepted = false;
    while (!accepted && damping < 1e12) {
      const next = advance(
        model,
        boundedStep(system, model.knots, bounds, damping)
      );
      const nextLine = centrelineOf(grid, next);
      const nextProjection = correspond(source, nextLine);
      const nextCost = costOf(
        source,
        nextLine,
        nextProjection,
        next,
        options.smoothing
      );
      if (nextCost < cost) {
        accepted = true;
        const settled = (cost - nextCost) / cost < SETTLED;
        model = next;
        line = nextLine;
        projection = nextProjection;
        cost = nextCost;
        damping = Math.max(1e-9, damping / 3);
        if (settled) {
          return { line, model, projection };
        }
      } else {
        damping *= 4;
      }
    }
    if (!accepted) {
      break;
    }
  }
  return { line, model, projection };
};

const reachOf = (source: Source, solved: Solved): number => {
  const last = source.x.length - 1;
  const at =
    (solved.projection.segment[last] ?? 0) +
    (solved.projection.share[last] ?? 0);
  const end = solved.line.sampleCount - 1;
  if (at < end - 1e-9) {
    return at;
  }
  const ex = solved.line.worldX[end] ?? 0;
  const ez = solved.line.worldZ[end] ?? 0;
  const tx = ex - (solved.line.worldX[end - 1] ?? ex);
  const tz = ez - (solved.line.worldZ[end - 1] ?? ez);
  return (
    end +
    Math.max(
      0,
      (((source.x[last] ?? 0) - ex) * tx + ((source.z[last] ?? 0) - ez) * tz) /
        Math.hypot(tx, tz)
    )
  );
};

const regrid = (solved: Solved, grid: Grid): Model => {
  const knots = new Float64Array(grid.knotS.length);
  for (let knot = 1; knot < knots.length - 1; knot += 1) {
    const at = Math.min(
      solved.line.sampleCount - 1,
      Math.round(grid.knotS[knot] ?? 0)
    );
    knots[knot] = solved.line.curvature[at] ?? 0;
  }
  return { knots, start: solved.model.start };
};

const percentile = (sorted: Float64Array, share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)] ??
  0;

const forcedSpans = (
  source: Source,
  grid: Grid,
  solved: Solved,
  deviation: Float64Array,
  bounds: Float64Array
): ForcedSpan[] => {
  const spans: { from: number; to: number }[] = [];
  const { knots } = solved.model;
  for (let knot = 1; knot < knots.length - 1; knot += 1) {
    if (Math.abs(knots[knot] ?? 0) < (bounds[knot] ?? 0) - BOUND_TOLERANCE) {
      continue;
    }
    const from = grid.knotS[knot - 1] ?? 0;
    const to = grid.knotS[knot + 1] ?? from;
    const open = spans.at(-1);
    if (open && open.to >= from) {
      open.to = to;
    } else {
      spans.push({ from, to });
    }
  }
  return spans.map(({ from, to }) => {
    let fromM = Number.POSITIVE_INFINITY;
    let toM = Number.NEGATIVE_INFINITY;
    let maxErrorM = 0;
    for (let index = 0; index < source.x.length; index += 1) {
      const at =
        (solved.projection.segment[index] ?? 0) +
        (solved.projection.share[index] ?? 0);
      if (at >= from && at <= to) {
        const chainage = source.atM[index] ?? 0;
        fromM = Math.min(fromM, chainage);
        toM = Math.max(toM, chainage);
        maxErrorM = Math.max(maxErrorM, deviation[index] ?? 0);
      }
    }
    return { fromM, maxErrorM, toM };
  });
};

interface Settled {
  readonly grid: Grid;
  readonly bounds: Float64Array;
  readonly solved: Solved;
}

const settle = (
  source: Source,
  whole: Grid,
  first: Model,
  options: FitOptions
): Settled => {
  let grid = whole;
  let model = first;
  for (let cycle = 1; ; cycle += 1) {
    const bounds = boundsOf(grid, source, options);
    const held = solve(
      source,
      grid,
      clampKeepingTurn(model, bounds),
      options,
      bounds,
      alongArc,
      WARM_ITERATIONS
    );
    const solved = solve(
      source,
      grid,
      held.model,
      options,
      bounds,
      project,
      SETTLE_ITERATIONS
    );
    const reach = Math.round(reachOf(source, solved));
    if (cycle === MAX_CYCLES || reach === Math.round(grid.knotS.at(-1) ?? 0)) {
      return { bounds, grid, solved };
    }
    grid = gridOf(reach, options.pieceLengthM);
    model = regrid(solved, grid);
  }
};

const distancesOf = (
  source: Source,
  { line, projection }: Solved
): Float64Array =>
  Float64Array.from(source.x, (x, index) => {
    const at = projection.segment[index] ?? 0;
    const share = projection.share[index] ?? 0;
    const roadX =
      (line.worldX[at] ?? 0) * (1 - share) + (line.worldX[at + 1] ?? 0) * share;
    const roadZ =
      (line.worldZ[at] ?? 0) * (1 - share) + (line.worldZ[at + 1] ?? 0) * share;
    return Math.hypot(roadX - x, roadZ - (source.z[index] ?? 0));
  });

export const fitPolyline = (
  line: readonly Position[],
  options: FitOptions
): Fit => {
  const source = resample(line);
  const whole = gridOf(Math.round(source.lengthM), options.pieceLengthM);
  const free = solve(
    source,
    whole,
    initialModel(source, whole),
    options,
    new Float64Array(whole.knotS.length).fill(Number.POSITIVE_INFINITY),
    alongArc,
    SETTLE_ITERATIONS
  );
  const { bounds, grid, solved } = settle(source, whole, free.model, options);
  const deviationM = distancesOf(source, solved);
  const sorted = deviationM.toSorted();
  let squares = 0;
  for (const value of deviationM) {
    squares += value * value;
  }
  let tightest = 0;
  for (const value of solved.line.curvature) {
    tightest = Math.max(tightest, Math.abs(value));
  }
  return {
    deviationM,
    error: {
      maxM: sorted.at(-1) ?? 0,
      p95M: percentile(sorted, 0.95),
      rmsM: Math.sqrt(squares / deviationM.length),
    },
    forced: forcedSpans(source, grid, solved, deviationM, bounds),
    lengthM: solved.line.length,
    minRadiusM: 1 / tightest,
    pieces: piecesOf(grid, solved.model.knots),
    sourceLengthM: source.lengthM,
    start: solved.model.start,
  };
};
