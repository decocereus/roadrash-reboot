import { describe, expect, it } from "vitest";

import { duskLook, nightLook } from "../src/game/bar-light.ts";
import { figureFloorOf, figureShadowOf } from "../src/game/cel.ts";
import { lookOf } from "../src/game/looks.ts";

const FLOOR = 0.93;

describe("a rider's shadow band", () => {
  it.each(["salt-coast", "lowtown"] as const)(
    "stays readable under the %s tones, at full chroma",
    (region) => {
      expect(figureShadowOf(lookOf(region))).toStrictEqual({
        chroma: 1,
        depth: FLOOR,
      });
    }
  );

  it("keeps a look's own depth when its shadow tone is already shallower", () => {
    const { depth } = figureShadowOf({
      lit: [1, 1, 1],
      shadow: [0.98, 0.98, 0.98],
    });
    expect(depth).toBeGreaterThan(FLOOR);
  });

  it.each([
    ["salt-coast", 0.282],
    ["lowtown", 0.1824],
    ["stonepeak", 0.282],
  ] as const)(
    "stops a rider in world shadow 0.05 above the %s ink",
    (region, floor) => {
      expect(figureFloorOf(lookOf(region).ink)).toBeCloseTo(floor, 3);
    }
  );

  it("follows the bar's ink from dusk to night", () => {
    expect(figureFloorOf(duskLook.ink)).toBeCloseTo(0.2424, 3);
    expect(figureFloorOf(nightLook.ink)).toBeLessThan(
      figureFloorOf(duskLook.ink)
    );
  });
});
