import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { readCorridor } from "@racer/track/madrid-corridor";
import type { Position } from "@racer/track/madrid-schema";
import { describe, expect, it } from "vitest";

import { ringProblem } from "../src/geometry.ts";
import { decodeScene } from "../src/scene.ts";
import type { Scene } from "../src/scene.ts";
import { stretchEntries } from "../src/settings.ts";
import { buildStretch } from "../src/stretch.ts";
import type { Stretch } from "../src/stretch.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const data = readCorridor(
  readFileSync(path.join(root, "packages/track/data/madrid-corridor.json"), {
    encoding: "utf-8",
  })
);

const sceneOf = (id: string): Scene =>
  decodeScene(
    JSON.parse(
      readFileSync(path.join(import.meta.dirname, `../scenes/${id}.json`), {
        encoding: "utf-8",
      })
    )
  );

const built = new Map<string, Stretch>(
  stretchEntries.map((entry) => [
    entry.id,
    buildStretch(data, sceneOf(entry.id), entry.settings),
  ])
);

const stretchOf = (id: string): Stretch => {
  const stretch = built.get(id);
  if (!stretch) {
    throw new Error(`The builder made no ${id}.`);
  }
  return stretch;
};

const crossingProw: readonly Position[] = [
  [3046.1, 1661.8],
  [3038.3, 1660.5],
  [3032.9, 1654.7],
  [3032.4, 1646.7],
  [3037, 1640.3],
  [3044.6, 1638],
  [3051.9, 1641],
  [3055.8, 1647.9],
  [3030, 1634],
  [3028, 1662],
];

describe("authored scene rings", () => {
  it("names the crossing in Carrión's first drawn prow", () => {
    expect(ringProblem(crossingProw)).toBe(
      "crosses itself: the edge 3037, 1640.3 to 3044.6, 1638 meets the edge 3055.8, 1647.9 to 3030, 1634"
    );
  });

  it("refuses a scene that carries it, so the ring cannot reach a track", () => {
    const scene = {
      grass: [],
      massing: [
        {
          name: "Edificio Carrión",
          parts: [{ heightM: 54, liftM: 0, ring: crossingProw }],
        },
      ],
      water: [],
    };
    expect(() => decodeScene(scene)).toThrow(
      "crosses itself: the edge 3037, 1640.3 to 3044.6, 1638"
    );
  });

  it.each([
    [
      "a ring of two points",
      [
        [0, 0],
        [10, 0],
      ],
      "has 2 points, and a ring needs three",
    ],
    [
      "a ring that repeats a point",
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [10, 10],
      ],
      "repeats the point 10, 10",
    ],
    [
      "a ring with no room inside it",
      [
        [0, 0],
        [10, 0],
        [20, 0],
      ],
      "encloses 0.00 m², too little to stand up",
    ],
    [
      "a ring drawn the other way round",
      [
        [0, 0],
        [0, 10],
        [10, 10],
        [10, 0],
      ],
      "runs clockwise, and corridor rings run counter-clockwise",
    ],
  ] satisfies readonly (readonly [string, readonly Position[], string])[])(
    "refuses %s",
    (_, ring, problem) => {
      expect(ringProblem(ring)).toBe(problem);
    }
  );

  it.each(stretchEntries.map((entry) => entry.id))(
    "accepts every ring the %s scene draws",
    (id) => {
      const scene = sceneOf(id);
      const rings = [
        ...scene.grass,
        ...scene.massing.flatMap((landmark) =>
          landmark.parts.map((part) => part.ring)
        ),
        ...scene.water.map((body) => body.ring),
      ];
      expect(rings.length).toBeGreaterThan(0);
      expect(
        rings.map(ringProblem).filter((found) => found !== null)
      ).toStrictEqual([]);
    }
  );

  it.each(stretchEntries.map((entry) => entry.id))(
    "keeps no footprint with a broken ring near the %s",
    (id) => {
      expect(stretchOf(id).report.brokenFootprints).toStrictEqual([]);
    }
  );
});

describe("the Casa de Campo hook the city builder took over", () => {
  const hook = stretchOf("madrid-hook");
  const triples = hook.pieces.map((piece) => [
    piece.length,
    piece.endCurvature,
    piece.endGrade,
  ]);

  it("rides the pieces it rode before the city stretch existed", () => {
    expect(triples).toHaveLength(42);
    expect(triples.reduce((total, [length = 0]) => total + length, 0)).toBe(
      1039
    );
    expect(
      createHash("sha256")
        .update(JSON.stringify(triples))
        .digest("hex")
        .slice(0, 16)
    ).toBe("663e864c0f492d94");
  });

  it("starts the rider where it did", () => {
    expect(hook.start).toStrictEqual({
      heading: -1.638015,
      x: 0.2,
      z: 0.1,
    });
    expect(hook.startHeightM).toBe(581.8);
  });

  it("stands up the same scenery", () => {
    expect(hook.blocks).toHaveLength(48);
    expect(hook.patches).toStrictEqual([]);
    expect(hook.water).toHaveLength(1);
    expect(hook.water[0]?.level).toBe(14.2);
    expect(hook.water[0]?.ring).toHaveLength(208);
  });
});
