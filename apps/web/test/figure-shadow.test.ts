import { describe, expect, it } from "vitest";

import { duskLook, nightLook } from "../src/game/bar-light.ts";
import { figureDepthOf, figureFloorOf } from "../src/game/cel.ts";
import { lookOf, night, sunset } from "../src/game/looks.ts";

const FLOOR = 0.93;

describe("a rider's shadow band", () => {
  it.each(["salt-coast", "lowtown"] as const)(
    "stays readable under the %s tones",
    (region) => {
      expect(figureDepthOf(lookOf(region))).toBe(FLOOR);
    }
  );

  it("keeps a look's own depth when its shadow tone is already shallower", () => {
    expect(
      figureDepthOf({ lit: [1, 1, 1], shadow: [0.98, 0.98, 0.98] })
    ).toBeGreaterThan(FLOOR);
  });

  it.each([
    ["sunset", sunset.ink, 0.282],
    ["night", night.ink, 0.1824],
  ] as const)(
    "stops a rider in world shadow 0.05 above the %s ink",
    (_hour, ink, floor) => {
      expect(figureFloorOf(ink)).toBeCloseTo(floor, 3);
    }
  );

  it("follows the bar's ink from dusk to night", () => {
    expect(figureFloorOf(duskLook.ink)).toBeCloseTo(0.2424, 3);
    expect(figureFloorOf(nightLook.ink)).toBeLessThan(
      figureFloorOf(duskLook.ink)
    );
  });
});
