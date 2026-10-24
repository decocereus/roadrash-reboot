import { describe, expect, it } from "vitest";

import { eased, sampleAlignment } from "./alignment.ts";
import type { TrackPiece, TrackPieces } from "./alignment.ts";
import { roadIds, roadLevels } from "./road.ts";
import { trackFor } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { Track } from "./track.ts";
import { ridgeRoad } from "./tracks/ridge-road.ts";

const fingerprintsBeforePieces = {
  "breakwater-run-1": "7c1418b27148bf5a",
  "breakwater-run-2": "75e7421037a5167a",
  "breakwater-run-3": "7af6107447406318",
  "breakwater-run-4": "28f2c1de4c5d2141",
  "breakwater-run-5": "6a384ef557c1180d",
  "cinder-wash-1": "49e4f1bf2b8c83c8",
  "cinder-wash-2": "7ea5a64a0c03388b",
  "cinder-wash-3": "2581567810f540bd",
  "cinder-wash-4": "15667f024edac80a",
  "cinder-wash-5": "53bb9314471f47af",
  "hollow-pine-road-1": "30a4e854157f83ed",
  "hollow-pine-road-2": "777468dc28f7eebf",
  "hollow-pine-road-3": "384c267a64cf5f83",
  "hollow-pine-road-4": "05975d0b34d8ade8",
  "hollow-pine-road-5": "2a6c7110033e9cae",
  "ridge-road-1": "6d6645dd0bbb909f",
  "ridge-road-2": "2a1ad69e316f3c79",
  "ridge-road-3": "40669f3e14875b39",
  "ridge-road-4": "2ad58f5b24ba2a0e",
  "ridge-road-5": "0b76a5622ffd8189",
  "slag-row-1": "68fec9d72b45850b",
  "slag-row-2": "1cf79c5d36bdfcd0",
  "slag-row-3": "178aa23f5a58f457",
  "slag-row-4": "0f27e1e3587d5cf1",
  "slag-row-5": "41ec28ae2afa956e",
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
    track.props,
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
  it("every road at every level compiles to the centreline, props, ramps and hazards it had before pieces replaced sections", () => {
    const fingerprints = Object.fromEntries(
      roadIds.flatMap((roadId) =>
        roadLevels.map((level) => [
          `${roadId}-${level}`,
          fingerprintOf(trackFor(roadId, level)),
        ])
      )
    );
    expect(fingerprints).toStrictEqual(fingerprintsBeforePieces);
  });

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
