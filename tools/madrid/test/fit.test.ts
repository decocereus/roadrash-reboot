import { readFileSync } from "node:fs";
import path from "node:path";

import { sampleAlignment } from "@racer/track/alignment";
import type { TrackPiece } from "@racer/track/alignment";
import { readCorridor } from "@racer/track/madrid-corridor";
import type { Position } from "@racer/track/madrid-schema";
import { describe, expect, it } from "vitest";

import { fitPolyline } from "../src/fit.ts";
import { between, corridorLine } from "../src/geometry.ts";
import { fitGrades } from "../src/grade.ts";
import { signChangesPerKilometre } from "../src/smoothness.ts";

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
    expect(fit.error.maxM).toBeLessThan(0.1);
    expect(Math.abs(fit.lengthM - 700)).toBeLessThanOrEqual(1);
    expect(fit.minRadiusM).toBeCloseTo(120, -1);
    expect({
      heading: Number(fit.start.heading.toFixed(2)),
      x: Number(fit.start.x.toFixed(1)),
      z: Number(fit.start.z.toFixed(1)),
    }).toStrictEqual({ heading: 1.1, x: 300, z: -50 });
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
    }).toStrictEqual({ maxM: 1.5, p95M: 0.5, rmsM: 0.2, tightestM: 99.6 });
  });

  it("keeps a noisy straight straight", () => {
    const line: Position[] = Array.from({ length: 1001 }, (_, index) => [
      Math.sin(index / 11 + 1.3) * 0.2 + Math.sin(index / 5.7 + 0.4) * 0.12,
      index,
    ]);
    const fit = fitPolyline(line, { ...options, minRadiusM: 0 });
    expect(
      signChangesPerKilometre(
        fit.pieces.map((fitted) => fitted.endCurvature),
        fit.lengthM
      )
    ).toBeLessThanOrEqual(2);
    expect(fit.error.rmsM).toBeLessThanOrEqual(0.1);
    expect(fit.error.maxM).toBeLessThanOrEqual(0.2);
  });

  it("keeps a noisy climb smooth", () => {
    const knotS = new Float64Array(41);
    for (let knot = 1; knot < knotS.length; knot += 1) {
      knotS[knot] = (knotS[knot - 1] ?? 0) + 25;
    }
    const samples = Array.from({ length: 101 }, (_, index) => {
      const s = index * 10;
      return {
        groundM:
          20 + 0.03 * s + Math.sin(s * 0.9) * 0.12 + Math.sin(s * 2.3) * 0.15,
        s,
      };
    });
    const grades = fitGrades({ knotS, samples });
    expect(grades.maxStepPerMetre).toBeLessThanOrEqual(0.006);
    expect(grades.rmsM).toBeLessThanOrEqual(0.25);
    expect(grades.maxM).toBeLessThanOrEqual(0.8);
  });
});
