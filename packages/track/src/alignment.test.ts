import { describe, expect, it } from "vitest";

import { eased, sampleAlignment } from "./alignment.ts";
import type { TrackPiece, TrackPieces } from "./alignment.ts";
import { roadAtLevel, roadIds, roadLevels } from "./road.ts";
import { roads } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { Track } from "./track.ts";
import { ridgeRoad } from "./tracks/ridge-road.ts";

const fingerprintsBeforePieces = {
  "breakwater-run-1": "58f62d674779e78f",
  "breakwater-run-2": "18d4b67c3557fff2",
  "breakwater-run-3": "587ac8136226bd78",
  "breakwater-run-4": "6cfbfbc76105a0aa",
  "breakwater-run-5": "2af6782137b35078",
  "cinder-wash-1": "2fd6a2ba0ef21ac3",
  "cinder-wash-2": "460ebef4369a6337",
  "cinder-wash-3": "2f6f22212eb3d034",
  "cinder-wash-4": "6d44a30973bc83f1",
  "cinder-wash-5": "7c3b285b3ffa5ff5",
  "hollow-pine-road-1": "54c2f32f310883de",
  "hollow-pine-road-2": "7e0696f75f1d92ba",
  "hollow-pine-road-3": "5a1ce9486f0ce2e1",
  "hollow-pine-road-4": "4cdc9bc64f53e644",
  "hollow-pine-road-5": "0aae76d003d2f64c",
  "ridge-road-1": "30ee201f2a12f56e",
  "ridge-road-2": "38a49b31475bd11d",
  "ridge-road-3": "0d887d64694b0db1",
  "ridge-road-4": "464c3df76331db44",
  "ridge-road-5": "2efcc7c764428e85",
  "slag-row-1": "36a7676561758935",
  "slag-row-2": "125e6afd26e5ea55",
  "slag-row-3": "1d905bb3453bcdc2",
  "slag-row-4": "7ee67b2e47c48ea6",
  "slag-row-5": "7c1722f66449fe88",
};

const DIGEST_MODULUS = 2_147_483_647;

const bits = new DataView(new ArrayBuffer(8));

const fingerprintOf = (track: Track): string => {
  let first = 0;
  let second = 0;
  const add = (chunk: number): void => {
    first = (first * 65_599 + chunk) % DIGEST_MODULUS;
    second = (second * 40_503 + chunk) % DIGEST_MODULUS;
  };
  for (const values of [
    track.worldX,
    track.worldY,
    track.worldZ,
    track.heading,
    track.curvature,
    track.slope,
    track.slopeRate,
  ]) {
    for (const value of values) {
      bits.setFloat64(0, value + 0);
      for (let at = 0; at < 8; at += 2) {
        add(bits.getUint16(at));
      }
    }
  }
  for (const char of JSON.stringify([
    track.props.filter((prop) => prop.kind !== "chevron"),
    track.features,
    track.hazards,
  ])) {
    add(char.codePointAt(0) ?? 0);
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
};

const piece = (
  length: number,
  endCurvature: number,
  endGrade = 0
): TrackPiece => ({
  easedClimb: 0,
  easedTurn: 0,
  endCurvature,
  endGrade,
  length,
});

const RADIUS = 120;

const sweeper: TrackPieces = [
  piece(100, 0),
  piece(75, 1 / RADIUS),
  piece(150, 1 / RADIUS),
  piece(75, 0),
  piece(100, 0),
];

const lineOf = (pieces: TrackPieces) =>
  sampleAlignment({
    leadInLength: 0,
    pieces,
    runoffLength: 0,
    start: { heading: 0, x: 0, z: 0 },
  });

const sweeperCurvatureAt = (s: number): number => {
  if (s < 100 || s >= 400) {
    return 0;
  }
  if (s < 175) {
    return (s - 100) / 75 / RADIUS;
  }
  return s < 325 ? 1 / RADIUS : (400 - s) / 75 / RADIUS;
};

describe("track pieces", () => {
  it("every road at every level, without the crossings added since, compiles to the centreline, ramps, hazards and props other than chevrons it had before pieces replaced sections", () => {
    const fingerprints = Object.fromEntries(
      roadIds.flatMap((roadId) =>
        roadLevels.map((level) => [
          `${roadId}-${level}`,
          fingerprintOf(
            compileTrack({
              ...roadAtLevel(roads[roadId], level),
              crossings: [],
            })
          ),
        ])
      )
    );
    expect(fingerprints).toStrictEqual(fingerprintsBeforePieces);
  }, 60_000);

  it("a clothoid changes the curvature evenly, an arc holds it, and the road lands where the curvature integrates to", () => {
    const line = lineOf(sweeper);
    for (let s = 0; s <= 500; s += 1) {
      expect(line.curvature[s]).toBeCloseTo(sweeperCurvatureAt(s), 14);
    }
    expect(line.heading[500]).toBeCloseTo(75 / RADIUS + 150 / RADIUS, 12);
    let heading = 0;
    let x = 0;
    let z = 0;
    const step = 0.01;
    for (let s = 0; s < 500; s += step) {
      const middle = heading + (sweeperCurvatureAt(s) * step) / 2;
      x += Math.sin(middle) * step;
      z -= Math.cos(middle) * step;
      heading += sweeperCurvatureAt(s + step / 2) * step;
    }
    expect(
      Math.hypot((line.worldX[500] ?? 0) - x, (line.worldZ[500] ?? 0) - z)
    ).toBeLessThan(0.02);
  });

  it("a grade piece climbs on a grade that never jumps", () => {
    const line = lineOf([
      piece(100, 0, 0),
      piece(100, 0, 0.06),
      piece(200, 0, 0.06),
      piece(100, 0, 0),
      piece(100, 0, 0),
    ]);
    expect(line.worldY[200]).toBeCloseTo(3, 9);
    expect(line.worldY[600]).toBeCloseTo(18, 9);
    expect(line.slopeRate[150]).toBeCloseTo(0.0006, 12);
    expect(line.slope[300]).toBeCloseTo(0.06, 12);
    let steepestChange = 0;
    for (let s = 1; s <= 600; s += 1) {
      steepestChange = Math.max(
        steepestChange,
        Math.abs((line.slope[s] ?? 0) - (line.slope[s - 1] ?? 0))
      );
    }
    expect(steepestChange).toBeLessThan(0.0006 + 1e-12);
  });

  it("a start position and heading move and turn the whole road, lead-in included, and leave its bends and hills alone", () => {
    const heading = 0.7;
    const placed = compileTrack({
      ...ridgeRoad,
      start: { heading, x: 500, z: -200 },
    });
    const home = compileTrack(ridgeRoad);
    let farthest = 0;
    for (let index = 0; index < home.sampleCount; index += 1) {
      const x = home.worldX[index] ?? 0;
      const z = home.worldZ[index] ?? 0;
      farthest = Math.max(
        farthest,
        Math.hypot(
          500 +
            x * Math.cos(heading) -
            z * Math.sin(heading) -
            (placed.worldX[index] ?? 0),
          -200 +
            z * Math.cos(heading) +
            x * Math.sin(heading) -
            (placed.worldZ[index] ?? 0)
        ),
        Math.abs(
          (home.heading[index] ?? 0) + heading - (placed.heading[index] ?? 0)
        )
      );
    }
    expect(farthest).toBeLessThan(1e-6);
    expect(placed.curvature).toStrictEqual(home.curvature);
    expect(placed.worldY).toStrictEqual(home.worldY);
  });

  it("a road that does not finish straight and level does not compile", () => {
    expect(() =>
      compileTrack({
        ...ridgeRoad,
        pieces: [...eased([[300, 0, 0]]), piece(50, 1 / 200)],
      })
    ).toThrow("A track must finish straight and level.");
    expect(() =>
      compileTrack({
        ...ridgeRoad,
        pieces: [...eased([[300, 0, 0]]), piece(50, 0, 0.02)],
      })
    ).toThrow("A track must finish straight and level.");
  });
});
