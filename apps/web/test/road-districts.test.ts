import { roadHalfWidthAt, vergeHalfWidthAt } from "@racer/track/districts";
import { createRandom } from "@racer/track/random";
import { roads, trackFor } from "@racer/track/roads";
import { compileTrack, placeOnTrack } from "@racer/track/track";
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
    const uniform = compileTrack(roads["slag-row"]);
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

  it.each([
    ["a road of three, one and two lanes", threeOneTwo],
    ["Breakwater Run", trackFor("breakwater-run")],
  ] as const)(
    "stands no block's front on %s, wherever along it the verge is widest",
    (_name, track) => {
      const tooClose = layBlocks(track).filter(({ front, length, s }) =>
        Array.from({ length: Math.ceil(length) + 1 }, (_, metre) =>
          vergeHalfWidthAt(track, s + metre)
        ).some((verge) => front < verge)
      );
      expect(tooClose).toStrictEqual([]);
    }
  );

  it("leaves every Breakwater Run block's front face clear of the tarmac, on the bends and across each change of width", () => {
    const track = trackFor("breakwater-run");
    const on = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
    const clearance = (
      worldX: number,
      worldZ: number,
      near: number
    ): number => {
      let least = Number.POSITIVE_INFINITY;
      for (let s = near - 60; s <= near + 60; s += 2) {
        placeOnTrack(track, s, 0, on);
        least = Math.min(
          least,
          Math.hypot(on.x - worldX, on.z - worldZ) - roadHalfWidthAt(track, s)
        );
      }
      return least;
    };
    const onRoad = layBlocks(track).filter(({ front, length, s, side }) => {
      const middle = s + length / 2;
      placeOnTrack(track, middle, side * front, on);
      const { heading, x, z } = on;
      return [-0.5, -0.25, 0, 0.25, 0.5].some(
        (share) =>
          clearance(
            x + Math.sin(heading) * share * length,
            z - Math.cos(heading) * share * length,
            middle
          ) < 0
      );
    });
    expect(onRoad).toStrictEqual([]);
  });
});
