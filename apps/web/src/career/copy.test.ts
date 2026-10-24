import { recordedRules } from "@racer/career/bench";
import type { RaceRules } from "@racer/career/rules";
import { describe, expect, it } from "vitest";

import { levelName, vicCard } from "./copy.ts";

const served: RaceRules = { ...recordedRules, fieldSize: 10, levelCount: 3 };

describe("Vic's promotion cards", () => {
  it("fold the five cards into three levels, and the level-3 card points at the Ridge", () => {
    expect(
      ([1, 2, 3] as const).map((level) => [
        levelName(served, level),
        vicCard(served, level),
      ])
    ).toStrictEqual([
      [
        "New Meat",
        "Top three on all five roads and you move up. Don't go broke.",
      ],
      [
        "Dee's Tip",
        "Longer roads and bigger purses. The garage got a delivery. The new cops are quicker.",
      ],
      [
        "The Long Ridge",
        "Everyone's armed now. Try to keep up. Five roads left. The Ridge is last. She'll be waiting.",
      ],
    ]);
  });
});
