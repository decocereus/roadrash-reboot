import { describe, expect, it } from "vitest";

import { tierName, vicCard } from "./copy.ts";

describe("Vic's promotion cards", () => {
  it("has a card for each tier, and the tier-3 card points at the Ridge", () => {
    expect(
      ([1, 2, 3] as const).map((tier) => [tierName(tier), vicCard(tier)])
    ).toStrictEqual([
      ["New Meat", "Top three on every road and you move up. Don't go broke."],
      [
        "Dee's Tip",
        "Bigger purses. The garage got a delivery. The new cops are quicker.",
      ],
      [
        "The Long Ridge",
        "Everyone's armed now. Try to keep up. One more round. The Ridge is last. She'll be waiting.",
      ],
    ]);
  });
});
