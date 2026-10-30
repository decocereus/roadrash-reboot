import { sampleAlignment } from "@racer/track/alignment";
import type {
  Centreline,
  TrackPiece,
  TrackPieces,
  TrackStart,
} from "@racer/track/alignment";
import type { CorridorData, Position } from "@racer/track/madrid-schema";
import type {
  GroundCover,
  GroundPoint,
  SceneryBlock,
  SceneryPatch,
  SceneryWater,
} from "@racer/track/track";

import { fitPolyline } from "./fit.ts";
import {
  between,
  corridorLine,
  inside,
  nearest,
  pointAlong,
} from "./geometry.ts";
import { fitGrades } from "./grade.ts";
import type { Scene } from "./scene.ts";
import {
  curvatureFlipsPerKilometre,
  gradeChangeFlipsPerKilometre,
  sharpestGradeChange,
} from "./smoothness.ts";

interface SlowPlace {
  readonly name: string;
  readonly fromM: number;
  readonly toM: number;
  readonly minRadiusM: number;
}

interface Carriageway {
  readonly lanesEachWay: 1 | 2;
  readonly laneWidth: number;
  readonly shoulderWidth: number;
  readonly vergeWidth: number;
  readonly leadInLength: number;
  readonly runoffLength: number;
}

export interface StretchSettings {
  readonly fromM: number;
  readonly toM: number;
  readonly minRadiusM: number;
  readonly places: readonly SlowPlace[];
  readonly pieceLengthM: number;
  readonly road: Carriageway;
  readonly sceneReachM: number;
  readonly cover: GroundCover;
}

const vergeHalfWidthOf = (road: Carriageway): number =>
  road.lanesEachWay * road.laneWidth + road.shoulderWidth + road.vergeWidth;

interface PlaceDistance {
  readonly place: SlowPlace;
  readonly maxM: number;
}

interface WaterReport {
  readonly level: number;
  readonly points: number;
  readonly clearanceM: number;
}

interface MassingReport {
  readonly name: string;
  readonly parts: number;
  readonly clearanceM: number;
  readonly topM: number;
}

interface StretchReport {
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
  readonly curvatureFlipsPerKilometre: number;
  readonly gradeChangeFlipsPerKilometre: number;
  readonly water: readonly WaterReport[];
  readonly massing: readonly MassingReport[];
  readonly keptBlocks: number;
  readonly droppedBlocks: number;
}

export interface Stretch {
  readonly origin: Position;
  readonly startHeightM: number;
  readonly start: TrackStart;
  readonly pieces: TrackPieces;
  readonly blocks: readonly SceneryBlock[];
  readonly patches: readonly SceneryPatch[];
  readonly water: readonly SceneryWater[];
  readonly report: StretchReport;
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

const roadBeside = (road: Centreline, ring: readonly GroundPoint[]) => {
  let gap = Number.POSITIVE_INFINITY;
  let y = 0;
  for (let at = 0; at < road.sampleCount; at += 1) {
    const found = gapToRing(road.worldX[at] ?? 0, road.worldZ[at] ?? 0, ring);
    if (found < gap) {
      gap = found;
      y = road.worldY[at] ?? 0;
    }
  }
  return { gap, y };
};

export const buildStretch = (
  data: CorridorData,
  scene: Scene,
  settings: StretchSettings
): Stretch => {
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
  const grades = fitGrades({ knotS, samples });
  const pieces = fit.pieces.map((piece, index): TrackPiece => ({
    ...piece,
    endCurvature: Number(piece.endCurvature.toFixed(6)),
    endGrade: Number((grades.knots[index + 1] ?? 0).toFixed(5)),
  }));
  const [firstPiece, ...laterPieces] = pieces;
  if (!firstPiece) {
    throw new Error("The stretch fit returned no pieces.");
  }
  const start: TrackStart = {
    heading: Number(fit.start.heading.toFixed(6)),
    x: metre(fit.start.x - origin[0]),
    z: metre(fit.start.z + origin[1]),
  };
  const road = sampleAlignment({
    leadInLength: settings.road.leadInLength,
    pieces: [firstPiece, ...laterPieces],
    runoffLength: settings.road.runoffLength,
    start,
  });
  const verge = vergeHalfWidthOf(settings.road);
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
      clearance(road, ring) > verge
    ) {
      blocks.push({ height: metre(building.height.metres), lift: 0, ring });
    }
  }
  const footprints = blocks.length;
  const massing = scene.massing.map((landmark): MassingReport => {
    let closest = Number.POSITIVE_INFINITY;
    let topM = 0;
    for (const part of landmark.parts) {
      const ring = part.ring.map(toGround);
      const gap = clearance(road, ring);
      if (gap <= verge) {
        throw new Error(
          `${landmark.name} has massing ${gap.toFixed(1)} m from the road, inside its ${verge} m verge.`
        );
      }
      closest = Math.min(closest, gap);
      topM = Math.max(topM, part.liftM + part.heightM);
      blocks.push({ height: part.heightM, lift: part.liftM, ring });
    }
    return {
      clearanceM: closest,
      name: landmark.name,
      parts: landmark.parts.length,
      topM,
    };
  });
  const water = scene.water.map((body): SceneryWater => {
    const ring = body.ring.map(toGround);
    return { level: metre(roadBeside(road, ring).y - body.dropM), ring };
  });
  let steepestGrade = 0;
  for (const piece of pieces) {
    steepestGrade = Math.max(steepestGrade, Math.abs(piece.endGrade));
  }
  return {
    blocks,
    origin,
    patches: scene.grass.map((ring): SceneryPatch => ({
      cover: "grass",
      ring: ring.map(toGround),
    })),
    pieces: [firstPiece, ...laterPieces],
    report: {
      curvatureFlipsPerKilometre: curvatureFlipsPerKilometre(road),
      droppedBlocks: candidates.length - footprints,
      gradeChangeFlipsPerKilometre: gradeChangeFlipsPerKilometre(road),
      heightMaxM: grades.maxM,
      heightRmsM: grades.rmsM,
      keptBlocks: footprints,
      lengthM: fit.lengthM,
      massing,
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
      sharpestGradeChange: sharpestGradeChange(road),
      steepestGrade,
      streetLengthM: fit.sourceLengthM,
      tightestRadiusM: fit.minRadiusM,
      water: water.map((body): WaterReport => ({
        clearanceM: roadBeside(road, body.ring).gap,
        level: body.level,
        points: body.ring.length,
      })),
    },
    start,
    startHeightM: metre(grades.offset),
    water,
  };
};
