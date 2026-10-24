import { sampleAlignment } from "@racer/track/alignment";
import type {
  Centreline,
  TrackPiece,
  TrackPieces,
  TrackStart,
} from "@racer/track/alignment";
import type { CorridorData, Position } from "@racer/track/madrid-schema";
import type { GroundPoint, SceneryBlock } from "@racer/track/track";

import { solveSymmetric } from "./fit-system.ts";
import { fitPolyline } from "./fit.ts";
import {
  between,
  corridorLine,
  inside,
  nearest,
  pointAlong,
} from "./geometry.ts";

export interface HookPlace {
  readonly name: string;
  readonly fromM: number;
  readonly toM: number;
  readonly minRadiusM: number;
}

export interface HookSettings {
  readonly fromM: number;
  readonly toM: number;
  readonly minRadiusM: number;
  readonly places: readonly HookPlace[];
  readonly pieceLengthM: number;
  readonly smoothing: number;
  readonly gradeSmoothing: number;
  readonly leadInLength: number;
  readonly runoffLength: number;
  readonly vergeHalfWidthM: number;
  readonly sceneReachM: number;
  readonly lakeDropM: number;
}

export interface PlaceDistance {
  readonly place: HookPlace;
  readonly maxM: number;
}

export interface HookReport {
  readonly maxM: number;
  readonly p95M: number;
  readonly rmsM: number;
  readonly outsidePlacesM: number;
  readonly places: readonly PlaceDistance[];
  readonly lengthM: number;
  readonly streetLengthM: number;
  readonly tightestRadiusM: number;
  readonly heightRmsM: number;
  readonly heightMaxM: number;
  readonly steepestGrade: number;
  readonly sharpestGradeChange: number;
  readonly lakeClearanceM: number;
  readonly keptBlocks: number;
  readonly droppedBlocks: number;
}

export interface Hook {
  readonly origin: Position;
  readonly startHeightM: number;
  readonly start: TrackStart;
  readonly pieces: TrackPieces;
  readonly blocks: readonly SceneryBlock[];
  readonly lake: { readonly level: number; readonly ring: GroundPoint[] };
  readonly report: HookReport;
}

const metre = (value: number): number => Math.round(value * 10) / 10;

const worstOver = (
  deviation: Float64Array,
  fromM: number,
  toM: number
): number => {
  let worst = 0;
  for (
    let at = Math.max(0, Math.floor(fromM));
    at <= Math.min(deviation.length - 1, Math.ceil(toM));
    at += 1
  ) {
    worst = Math.max(worst, deviation[at] ?? 0);
  }
  return worst;
};

const nearestSample = (line: Centreline, x: number, z: number): number => {
  let best = Number.POSITIVE_INFINITY;
  let bestAt = 0;
  for (let at = 0; at < line.sampleCount; at += 1) {
    const gap =
      ((line.worldX[at] ?? 0) - x) ** 2 + ((line.worldZ[at] ?? 0) - z) ** 2;
    if (gap < best) {
      best = gap;
      bestAt = at;
    }
  }
  return bestAt;
};

interface Grades {
  readonly knots: Float64Array;
  readonly offset: number;
  readonly rmsM: number;
  readonly maxM: number;
}

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

interface GradeSample {
  readonly s: number;
  readonly groundM: number;
}

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

const addGradeSmoothing = (
  normal: Float64Array,
  unknowns: number,
  smoothing: number
): void => {
  const grades = unknowns - 1;
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

const fitGrades = (
  knotS: Float64Array,
  samples: readonly GradeSample[],
  smoothing: number
): Grades => {
  const unknowns = knotS.length - 1;
  const normal = new Float64Array(unknowns * unknowns);
  const rhs = new Float64Array(unknowns);
  const rows = samples.map((sample) => heightRow(knotS, sample.s, unknowns));
  addSamples(normal, rhs, rows, samples);
  addGradeSmoothing(normal, unknowns, smoothing);
  const solved = solveSymmetric(normal, rhs);
  const knots = new Float64Array(knotS.length);
  for (let knot = 1; knot < knotS.length - 1; knot += 1) {
    knots[knot] = solved[knot - 1] ?? 0;
  }
  return {
    knots,
    offset: solved[unknowns - 1] ?? 0,
    ...missesOf(rows, samples, solved),
  };
};

const gapToRing = (x: number, z: number, ring: readonly GroundPoint[]) => {
  const flipped: Position[] = ring.map(([px, pz]) => [px, -pz]);
  if (inside([x, -z], flipped)) {
    return 0;
  }
  return nearest([x, -z], [...flipped, flipped[0] ?? [0, 0]]).distanceM;
};

const clearance = (line: Centreline, ring: readonly GroundPoint[]): number => {
  let least = Number.POSITIVE_INFINITY;
  for (let at = 0; at < line.sampleCount; at += 1) {
    least = Math.min(
      least,
      gapToRing(line.worldX[at] ?? 0, line.worldZ[at] ?? 0, ring)
    );
  }
  return least;
};

export const buildHook = (
  data: CorridorData,
  lakeRing: readonly Position[],
  settings: HookSettings
): Hook => {
  const corridor = corridorLine(data);
  const street = between(corridor, settings.fromM, settings.toM);
  const fit = fitPolyline(street, {
    minRadiusM: settings.minRadiusM,
    pieceLengthM: settings.pieceLengthM,
    slowPlaces: settings.places.map((place) => ({
      fromM: place.fromM - settings.fromM,
      minRadiusM: place.minRadiusM,
      toM: place.toM - settings.fromM,
    })),
    smoothing: settings.smoothing,
  });
  const [first] = street;
  const origin: Position = [Math.round(first[0]), Math.round(first[1])];
  const horizontal = sampleAlignment({
    leadInLength: 0,
    pieces: fit.pieces,
    runoffLength: 0,
    start: fit.start,
  });
  const knotS = new Float64Array(fit.pieces.length + 1);
  for (const [index, piece] of fit.pieces.entries()) {
    knotS[index + 1] = (knotS[index] ?? 0) + piece.length;
  }
  const samples = data.elevation
    .filter(
      (sample) => sample.atM >= settings.fromM && sample.atM <= settings.toM
    )
    .map((sample) => {
      const [x, y] = pointAlong(corridor, sample.atM);
      return { groundM: sample.groundM, s: nearestSample(horizontal, x, -y) };
    });
  const grades = fitGrades(knotS, samples, settings.gradeSmoothing);
  const pieces = fit.pieces.map((piece, index): TrackPiece => ({
    ...piece,
    endCurvature: Number(piece.endCurvature.toFixed(6)),
    endGrade: Number((grades.knots[index + 1] ?? 0).toFixed(5)),
  }));
  const [firstPiece, ...laterPieces] = pieces;
  if (!firstPiece) {
    throw new Error("The hook fit returned no pieces.");
  }
  const start: TrackStart = {
    heading: Number(fit.start.heading.toFixed(6)),
    x: metre(fit.start.x - origin[0]),
    z: metre(fit.start.z + origin[1]),
  };
  const road = sampleAlignment({
    leadInLength: settings.leadInLength,
    pieces: [firstPiece, ...laterPieces],
    runoffLength: settings.runoffLength,
    start,
  });
  const toGround = ([x, y]: Position): GroundPoint => [
    metre(x - origin[0]),
    metre(-(y - origin[1])),
  ];
  const nearStreet = between(
    corridor,
    settings.fromM - settings.sceneReachM,
    settings.toM + settings.sceneReachM
  );
  const candidates = data.buildings
    .map((building) => {
      const [outer] = building.rings;
      const open =
        outer.length > 1 &&
        outer[0]?.[0] === outer.at(-1)?.[0] &&
        outer[0]?.[1] === outer.at(-1)?.[1]
          ? outer.slice(0, -1)
          : outer;
      return { building, open };
    })
    .filter(({ open }) =>
      open.some(
        (point) => nearest(point, nearStreet).distanceM <= settings.sceneReachM
      )
    );
  const blocks: SceneryBlock[] = [];
  for (const { building, open } of candidates) {
    const ring = open.map(toGround);
    if (
      building.height.kind !== "unavailable" &&
      clearance(road, ring) > settings.vergeHalfWidthM
    ) {
      blocks.push({ height: metre(building.height.metres), ring });
    }
  }
  const lake = lakeRing.map(toGround);
  let lakeGap = Number.POSITIVE_INFINITY;
  let lakeside = 0;
  for (let at = 0; at < road.sampleCount; at += 1) {
    const gap = gapToRing(road.worldX[at] ?? 0, road.worldZ[at] ?? 0, lake);
    if (gap < lakeGap) {
      lakeGap = gap;
      lakeside = road.worldY[at] ?? 0;
    }
  }
  let steepestGrade = 0;
  let sharpestGradeChange = 0;
  for (const [index, piece] of pieces.entries()) {
    steepestGrade = Math.max(steepestGrade, Math.abs(piece.endGrade));
    sharpestGradeChange = Math.max(
      sharpestGradeChange,
      Math.abs(piece.endGrade - (pieces[index - 1]?.endGrade ?? 0)) /
        piece.length
    );
  }
  return {
    blocks,
    lake: { level: metre(lakeside - settings.lakeDropM), ring: lake },
    origin,
    pieces: [firstPiece, ...laterPieces],
    report: {
      droppedBlocks: candidates.length - blocks.length,
      heightMaxM: grades.maxM,
      heightRmsM: grades.rmsM,
      keptBlocks: blocks.length,
      lakeClearanceM: lakeGap,
      lengthM: fit.lengthM,
      maxM: fit.error.maxM,
      outsidePlacesM: Math.max(
        0,
        ...[
          ...settings.places.map((place, index) => [
            (settings.places[index - 1]?.toM ?? settings.fromM) + 40,
            place.fromM - 40,
          ]),
          [(settings.places.at(-1)?.toM ?? 0) + 40, settings.toM],
        ].map(([from = 0, to = 0]) =>
          worstOver(fit.deviationM, from - settings.fromM, to - settings.fromM)
        )
      ),
      p95M: fit.error.p95M,
      places: settings.places.map((place) => ({
        maxM: worstOver(
          fit.deviationM,
          place.fromM - 40 - settings.fromM,
          place.toM + 40 - settings.fromM
        ),
        place,
      })),
      rmsM: fit.error.rmsM,
      sharpestGradeChange,
      steepestGrade,
      streetLengthM: fit.sourceLengthM,
      tightestRadiusM: fit.minRadiusM,
    },
    start,
    startHeightM: metre(grades.offset),
  };
};
