import { focusAfter } from "@racer/ui/components/menu-keys";
import { describe, expect, it } from "vitest";

describe("the keys that move between a card's buttons", () => {
  it("steps forward on Down, Right, S and D, and wraps at the end", () => {
    expect(
      ["ArrowDown", "ArrowRight", "s", "D"].map((key) => focusAfter(key, 0, 3))
    ).toStrictEqual([1, 1, 1, 1]);
    expect(focusAfter("ArrowDown", 2, 3)).toBe(0);
  });

  it("steps back on Up, Left, W and A, and wraps at the start", () => {
    expect(
      ["ArrowUp", "ArrowLeft", "W", "a"].map((key) => focusAfter(key, 2, 3))
    ).toStrictEqual([1, 1, 1, 1]);
    expect(focusAfter("ArrowUp", 0, 3)).toBe(2);
  });

  it("jumps to the ends on Home and End", () => {
    expect([focusAfter("Home", 1, 3), focusAfter("End", 1, 3)]).toStrictEqual([
      0, 2,
    ]);
  });

  it("leaves every other key, and a card with no button in focus, alone", () => {
    expect([
      focusAfter("Enter", 0, 3),
      focusAfter("ArrowDown", -1, 3),
    ]).toStrictEqual([null, null]);
  });
});
