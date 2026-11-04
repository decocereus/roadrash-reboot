import { describe, expect, it } from "vitest";

import { figureShadowOf } from "../src/game/cel.ts";
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
});
