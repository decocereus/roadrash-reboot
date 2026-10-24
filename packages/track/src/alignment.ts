import { cos, sin } from "./math.ts";

export interface TrackStart {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export interface TrackPiece {
  readonly length: number;
  readonly endCurvature: number;
  readonly endGrade: number;
  readonly easedTurn: number;
  readonly easedClimb: number;
}

export type TrackPieces = readonly [TrackPiece, ...TrackPiece[]];

type SectionRow = readonly [length: number, turnDegrees: number, climb: number];

type ClothoidRow = readonly [
  length: number,
  endCurvature: number,
  endGrade: number,
];

export interface Alignment {
  readonly start: TrackStart;
  readonly pieces: TrackPieces;
  readonly leadInLength: number;
  readonly runoffLength: number;
}

export interface Centreline {
  readonly length: number;
  readonly startS: number;
  readonly endS: number;
  readonly sampleCount: number;
  readonly worldX: Float64Array;
  readonly worldY: Float64Array;
  readonly worldZ: Float64Array;
  readonly heading: Float64Array;
  readonly curvature: Float64Array;
  readonly slope: Float64Array;
  readonly slopeRate: Float64Array;
}

interface PieceSpan {
  readonly piece: TrackPiece;
  readonly from: number;
  readonly to: number;
  readonly startCurvature: number;
  readonly startGrade: number;
  readonly startHeight: number;
  readonly turn: number;
  readonly climb: number;
}

const CURVE_RAMP = 0.3;

const smoothstep = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
};

const curveWeight = (progress: number): number => {
  if (progress < CURVE_RAMP) {
    return smoothstep(progress / CURVE_RAMP);
  }
  if (progress > 1 - CURVE_RAMP) {
    return smoothstep((1 - progress) / CURVE_RAMP);
  }
  return 1;
};

const easedPiece = ([length, turnDegrees, climb]: SectionRow): TrackPiece => ({
  easedClimb: climb,
  easedTurn: (turnDegrees * Math.PI) / 180,
  endCurvature: 0,
  endGrade: 0,
  length,
});

export const eased = ([first, ...rest]: readonly [
  SectionRow,
  ...SectionRow[],
]): TrackPieces => [easedPiece(first), ...rest.map(easedPiece)];

const clothoidPiece = ([
  length,
  endCurvature,
  endGrade,
]: ClothoidRow): TrackPiece => ({
  easedClimb: 0,
  easedTurn: 0,
  endCurvature,
  endGrade,
  length,
});

export const clothoids = ([first, ...rest]: readonly [
  ClothoidRow,
  ...ClothoidRow[],
]): TrackPieces => [clothoidPiece(first), ...rest.map(clothoidPiece)];

export const pieceSpans = (pieces: TrackPieces): PieceSpan[] => {
  const spans: PieceSpan[] = [];
  let from = 0;
  let startCurvature = 0;
  let startGrade = 0;
  let startHeight = 0;
  for (const piece of pieces) {
    const to = from + piece.length;
    const climb =
      (piece.length * (startGrade + piece.endGrade)) / 2 + piece.easedClimb;
    spans.push({
      climb,
      from,
      piece,
      startCurvature,
      startGrade,
      startHeight,
      to,
      turn:
        (piece.length * (startCurvature + piece.endCurvature)) / 2 +
        piece.easedTurn,
    });
    from = to;
    startCurvature = piece.endCurvature;
    startGrade = piece.endGrade;
    startHeight += climb;
  }
  return spans;
};

const sampleSpan = (
  span: PieceSpan,
  s: number,
  index: number,
  centreline: Centreline
): void => {
  const { piece, startCurvature, startGrade } = span;
  const progress = (s - span.from) / piece.length;
  const curvatureChange = piece.endCurvature - startCurvature;
  const gradeChange = piece.endGrade - startGrade;
  centreline.curvature[index] =
    startCurvature +
    curvatureChange * progress +
    (piece.easedTurn / (piece.length * (1 - CURVE_RAMP))) *
      curveWeight(progress);
  centreline.worldY[index] =
    span.startHeight +
    piece.length * progress * (startGrade + (gradeChange * progress) / 2) +
    (piece.easedClimb * (1 - cos(Math.PI * progress))) / 2;
  centreline.slope[index] =
    startGrade +
    gradeChange * progress +
    ((piece.easedClimb / piece.length) * Math.PI * sin(Math.PI * progress)) / 2;
  centreline.slopeRate[index] =
    gradeChange / piece.length +
    ((piece.easedClimb / (piece.length * piece.length)) *
      Math.PI *
      Math.PI *
      cos(Math.PI * progress)) /
      2;
};

export const sampleAlignment = (alignment: Alignment): Centreline => {
  const spans = pieceSpans(alignment.pieces);
  const last = spans.at(-1);
  if (!last || last.piece.endCurvature !== 0 || last.piece.endGrade !== 0) {
    throw new Error("A track must finish straight and level.");
  }
  const length = last.to;
  const finalHeight = last.startHeight + last.climb;
  const startS = -alignment.leadInLength;
  const endS = length + alignment.runoffLength;
  const sampleCount = Math.round(endS - startS) + 1;
  const centreline: Centreline = {
    curvature: new Float64Array(sampleCount),
    endS,
    heading: new Float64Array(sampleCount),
    length,
    sampleCount,
    slope: new Float64Array(sampleCount),
    slopeRate: new Float64Array(sampleCount),
    startS,
    worldX: new Float64Array(sampleCount),
    worldY: new Float64Array(sampleCount),
    worldZ: new Float64Array(sampleCount),
  };
  const { heading, worldX, worldY, worldZ } = centreline;

  let spanIndex = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const s = startS + index;
    if (s >= 0 && s < length) {
      let span = spans[spanIndex];
      while (span && s >= span.to) {
        spanIndex += 1;
        span = spans[spanIndex];
      }
      if (span) {
        sampleSpan(span, s, index, centreline);
      }
    } else if (s >= length) {
      worldY[index] = finalHeight;
    }
  }

  const { start } = alignment;
  const startIndex = alignment.leadInLength;
  heading[startIndex] = start.heading;
  worldX[startIndex] = start.x;
  worldZ[startIndex] = start.z;
  for (let index = startIndex + 1; index < sampleCount; index += 1) {
    const previous = index - 1;
    const meanCurvature =
      ((centreline.curvature[previous] ?? 0) +
        (centreline.curvature[index] ?? 0)) /
      2;
    const previousHeading = heading[previous] ?? 0;
    const nextHeading = previousHeading + meanCurvature;
    const midHeading = (previousHeading + nextHeading) / 2;
    heading[index] = nextHeading;
    worldX[index] = (worldX[previous] ?? 0) + sin(midHeading);
    worldZ[index] = (worldZ[previous] ?? 0) - cos(midHeading);
  }
  const backX = sin(start.heading);
  const backZ = cos(start.heading);
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    heading[index] = start.heading;
    worldX[index] = (worldX[index + 1] ?? 0) - backX;
    worldZ[index] = (worldZ[index + 1] ?? 0) + backZ;
  }
  return centreline;
};
