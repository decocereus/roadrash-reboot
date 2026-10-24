import { readFileSync } from "node:fs";
import path from "node:path";

import { sampleAlignment } from "@racer/track/alignment";
import type { TrackPiece } from "@racer/track/alignment";
import { readCorridor } from "@racer/track/madrid-corridor";
import type { Position } from "@racer/track/madrid-schema";
import { roadAtLevel, roadIds, roadLevels } from "@racer/track/road";
import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { fitPolyline } from "../src/fit.ts";
import { between, corridorLine } from "../src/geometry.ts";
import { fitGrades } from "../src/grade.ts";
import {
  curvatureFlipsPerKilometre,
  gradeChangeFlipsPerKilometre,
  sharpestGradeChange,
  smoothRoad,
} from "../src/smoothness.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const corridor = readCorridor(
  readFileSync(
    path.join(root, "packages/track/data/madrid-corridor.json"),
    "utf-8"
  )
);

const piece = (length: number, endCurvature: number): TrackPiece => ({
  easedClimb: 0,
  easedTurn: 0,
  endCurvature,
  endGrade: 0,
  length,
});

const options = { pieceLengthM: 25, slowPlaces: [] };

describe("fitting pieces to a street", () => {
  it("fits a road laid from pieces back onto itself, start and all", () => {
    const start = { heading: 1.1, x: 300, z: -50 };
    const road = sampleAlignment({
      leadInLength: 0,
      pieces: [
        piece(100, 0),
        piece(75, 1 / 120),
        piece(150, 1 / 120),
        piece(75, 0),
        piece(50, -1 / 200),
        piece(100, -1 / 200),
        piece(50, 0),
        piece(100, 0),
      ],
      runoffLength: 0,
      start,
    });
    const line: Position[] = Array.from(road.worldX, (x, index) => [
      x,
      -(road.worldZ[index] ?? 0),
    ]);
    const fit = fitPolyline(line, { ...options, minRadiusM: 0 });
    expect(fit.error.maxM).toBeLessThan(0.3);
    expect(fit.lengthM).toBe(700);
    expect(fit.minRadiusM).toBeGreaterThan(110);
    expect({
      heading: Number(fit.start.heading.toFixed(2)),
      x: Number(fit.start.x.toFixed(1)),
      z: Number(fit.start.z.toFixed(1)),
    }).toStrictEqual(start);
    expect(fit.forced).toStrictEqual([]);
  });

  const corner: Position[] = [
    [0, 0],
    [0, 300],
    [300, 300],
  ];
  const free = fitPolyline(corner, { ...options, minRadiusM: 0 });
  const held = fitPolyline(corner, { ...options, minRadiusM: 60 });

  it("keeps a right-angle corner to the radius limit and follows the street either side of it", () => {
    expect(free.minRadiusM).toBeLessThan(30);
    expect(held.minRadiusM).toBeGreaterThanOrEqual(60 - 1e-9);
    expect(held.deviationM[100]).toBeLessThan(0.5);
    expect(held.deviationM[500]).toBeLessThan(0.5);
  });

  it("reports the corner as the one place the limit moved the road off the street", () => {
    expect(held.forced).toHaveLength(1);
    const [span] = held.forced;
    expect(span?.fromM).toBeLessThan(300);
    expect(span?.toM).toBeGreaterThan(300);
    expect(span?.maxErrorM).toBeCloseTo(15, -1);
    expect(held.error.maxM).toBe(span?.maxErrorM);
  });

  it("measures how far the street runs past the end of the road, not only across it", () => {
    const fit = fitPolyline(
      [
        [0, 0],
        [0, 100.4],
      ],
      { ...options, minRadiusM: 60 }
    );
    expect(fit.lengthM).toBe(100);
    expect(fit.error.maxM).toBeCloseTo(0.4, 3);
  });

  it("returns the road its numbers describe when the length never settles", () => {
    const fit = fitPolyline(
      [
        [0, 0],
        [0, 300],
        [20, 300],
        [20, 0],
      ],
      { ...options, minRadiusM: 265 }
    );
    const road = sampleAlignment({
      leadInLength: 0,
      pieces: fit.pieces,
      runoffLength: 0,
      start: fit.start,
    });
    let tightest = 0;
    for (const value of road.curvature) {
      tightest = Math.max(tightest, Math.abs(value));
    }
    expect(road).toHaveLength(fit.lengthM);
    expect(1 / tightest).toBe(fit.minRadiusM);
  });

  it("matches the documented fit of the Madrid test interval at the 60 m limit", () => {
    const fit = fitPolyline(between(corridorLine(corridor), 600, 1600), {
      ...options,
      minRadiusM: 60,
    });
    expect({
      maxM: Number(fit.error.maxM.toFixed(1)),
      p95M: Number(fit.error.p95M.toFixed(1)),
      rmsM: Number(fit.error.rmsM.toFixed(1)),
      tightestM: Number(fit.minRadiusM.toFixed(1)),
    }).toStrictEqual({ maxM: 1.8, p95M: 1, rmsM: 0.4, tightestM: 72.9 });
  });

  it("holds every existing road to the smoothness limits", () => {
    for (const roadId of roadIds) {
      for (const level of roadLevels) {
        const track = compileTrack(roadAtLevel(roads[roadId], level));
        expect(curvatureFlipsPerKilometre(track)).toBeLessThanOrEqual(
          smoothRoad.curvatureFlipsPerKilometre
        );
        expect(gradeChangeFlipsPerKilometre(track)).toBeLessThanOrEqual(
          smoothRoad.gradeChangeFlipsPerKilometre
        );
        expect(sharpestGradeChange(track)).toBeLessThanOrEqual(
          smoothRoad.gradeChangePerMetre
        );
      }
    }
  });

  it("fits a noisy straight street inside the smoothness limits", () => {
    const street: Position[] = Array.from({ length: 51 }, (_, index) => [
      0.5 * Math.sin(index * 2.4),
      index * 20,
    ]);
    const fit = fitPolyline(street, { ...options, minRadiusM: 60 });
    const road = sampleAlignment({
      leadInLength: 0,
      pieces: fit.pieces,
      runoffLength: 0,
      start: fit.start,
    });
    expect(curvatureFlipsPerKilometre(road)).toBeLessThanOrEqual(
      smoothRoad.curvatureFlipsPerKilometre
    );
    expect(fit.error.maxM).toBeLessThan(0.6);
  });

  it("fits a noisy climb inside the smoothness limits", () => {
    const knotS = Float64Array.from({ length: 41 }, (_, knot) => knot * 25);
    const samples = Array.from({ length: 101 }, (_, index) => {
      const s = index * 10;
      return {
        groundM:
          0.04 * s + 0.4 * Math.sin(index * 2.4) + 0.2 * Math.sin(index * 0.9),
        s,
      };
    });
    const grades = fitGrades({ knotS, samples });
    const road = sampleAlignment({
      leadInLength: 0,
      pieces: [
        piece(25, 0),
        ...Array.from(grades.knots.subarray(1), (endGrade) => ({
          ...piece(25, 0),
          endGrade,
        })),
      ],
      runoffLength: 0,
      start: { heading: 0, x: 0, z: 0 },
    });
    expect(gradeChangeFlipsPerKilometre(road)).toBeLessThanOrEqual(
      smoothRoad.gradeChangeFlipsPerKilometre
    );
    expect(sharpestGradeChange(road)).toBeLessThanOrEqual(
      smoothRoad.gradeChangePerMetre
    );
    expect(grades.rmsM).toBeLessThan(0.5);
  });
});
