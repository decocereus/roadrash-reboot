import { vergeHalfWidthAt } from "@racer/track/districts";
import { createRandom } from "@racer/track/random";
import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { layBlocks } from "../src/game/city-blocks.ts";
import { lookOf } from "../src/game/looks.ts";
import { districtPieces } from "../src/game/road-strips.ts";
import { roadSurfacesOf } from "../src/game/road-texture.ts";
import { createWorld } from "../src/game/world.ts";
import { fakeWalkerAsset } from "./walker-asset.ts";

const WIDTHS = { shoulderWidth: 0.9, vergeWidth: 7 };

const threeOneTwo: Track = compileTrack({
  ...roads["breakwater-run"],
  districts: [
    { ...WIDTHS, from: 0, lanesEachWay: 3 },
    { ...WIDTHS, from: 3000, lanesEachWay: 1 },
    { ...WIDTHS, from: 3600, lanesEachWay: 2 },
  ],
});

const drawsNothing = new Proxy(
  {},
  {
    get: (_target, key) =>
      key === "createLinearGradient" || key === "createRadialGradient"
        ? () => ({ addColorStop: () => null })
        : () => null,
  }
);

describe("the road's pieces along a chunk", () => {
  it("keep one piece on a road of one district, even across the start line", () => {
    const uniform = compileTrack(roads["breakwater-run"]);
    expect(districtPieces(uniform, [-80, 120])).toStrictEqual([
      { lanes: uniform.plan.districts[0].lanesEachWay, span: [-80, 120] },
    ]);
  });

  it("split at each district that starts inside the chunk", () => {
    expect(districtPieces(threeOneTwo, [2900, 3100])).toStrictEqual([
      { lanes: 3, span: [2900, 3000] },
      { lanes: 1, span: [3000, 3100] },
    ]);
    expect(districtPieces(threeOneTwo, [3100, 3300])).toStrictEqual([
      { lanes: 1, span: [3100, 3300] },
    ]);
    expect(districtPieces(threeOneTwo, [3600, 3800])).toStrictEqual([
      { lanes: 2, span: [3600, 3800] },
    ]);
  });
});

describe("a road of several districts in the world", () => {
  beforeAll(() => {
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => drawsNothing }),
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("paints one road surface per lane count, wide enough for its widest district", () => {
    const surfaces = roadSurfacesOf(
      createRandom(1),
      lookOf(threeOneTwo.plan.region),
      threeOneTwo
    );
    const { laneWidth } = threeOneTwo.plan;
    expect(
      [...surfaces].map(([lanes, { half }]) => [lanes, half])
    ).toStrictEqual([
      [3, 3 * laneWidth + WIDTHS.shoulderWidth],
      [1, laneWidth + WIDTHS.shoulderWidth],
      [2, 2 * laneWidth + WIDTHS.shoulderWidth],
    ]);
  });

  it("builds", () => {
    const world = createWorld(threeOneTwo, fakeWalkerAsset());
    expect(world.scene.children.length).toBeGreaterThan(0);
    world.dispose();
  });

  it("stands no block's front on the road, wherever along it the verge is widest", () => {
    const tooClose = layBlocks(threeOneTwo).filter(({ front, length, s }) =>
      Array.from({ length: Math.ceil(length) + 1 }, (_, metre) =>
        vergeHalfWidthAt(threeOneTwo, s + metre)
      ).some((verge) => front < verge)
    );
    expect(tooClose).toStrictEqual([]);
  });
});
