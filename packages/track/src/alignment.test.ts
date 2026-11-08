import { describe, expect, it } from "vitest";

import { eased, sampleAlignment } from "./alignment.ts";
import type { TrackPiece, TrackPieces } from "./alignment.ts";
import { roadIds } from "./road.ts";
import { roads } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { Track } from "./track.ts";
import { ridgeRoad } from "./tracks/ridge-road.ts";

const fingerprintsBeforePieces = {
  "ridge-road": "422c832160f83d4c",
  "slag-row": "42a8a3b74af8c5f3",
};

const DIGEST_MODULUS = 2_147_483_647;

const bits = new DataView(new ArrayBuffer(8));

const FIRST_TIER_SHARE = 0.6;

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
    track.hazards
      .filter((hazard) => hazard.rarity < FIRST_TIER_SHARE)
      .map(({ rarity: _rarity, ...hazard }) => hazard),
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
    name: "a test line",
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
  it("every road Breakwater Run's rebuild left alone, without the crossings added since, compiles to the centreline, hazards and props other than chevrons it had before pieces replaced sections", () => {
    const fingerprints = Object.fromEntries(
      roadIds
        .filter((roadId) => roadId !== "breakwater-run")
        .map((roadId) => [
          roadId,
          fingerprintOf(compileTrack({ ...roads[roadId], crossings: [] })),
        ])
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

  it("a lead-in that is not a whole number of metres from 0 up does not compile", () => {
    for (const leadInLength of [100.5, -1, Number.NaN, Infinity]) {
      expect(() => compileTrack({ ...ridgeRoad, leadInLength })).toThrow(
        `Ridge Road has a lead-in of ${leadInLength} m,`
      );
    }
  });

  it("a piece that does not run forward a finite length does not compile", () => {
    for (const length of [-10, 0, Number.NaN, Infinity]) {
      expect(() =>
        compileTrack({
          ...ridgeRoad,
          carriers: [],
          pieces: [piece(100, 0), piece(length, 0), piece(100, 0)],
        })
      ).toThrow(`Piece 1 of Ridge Road runs ${length} m,`);
    }
  });

  it("a piece with a curvature, grade, turn or climb that is not finite does not compile", () => {
    const straightPiece = piece(100, 0);
    for (const [term, value] of [
      ["endCurvature", Number.NaN],
      ["endGrade", Infinity],
      ["easedTurn", Number.NaN],
      ["easedClimb", -Infinity],
    ] as const) {
      expect(() =>
        compileTrack({
          ...ridgeRoad,
          carriers: [],
          pieces: [
            straightPiece,
            { ...straightPiece, [term]: value },
            straightPiece,
          ],
        })
      ).toThrow(`Piece 1 of Ridge Road has ${term} ${value},`);
    }
  });
});
