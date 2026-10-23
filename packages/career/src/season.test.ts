import { describe, expect, it } from "vitest";

import {
  enter,
  lastOf,
  settle,
  sprint,
  wreckTimes,
} from "./career-fixtures.ts";
import { roadBoss } from "./field.ts";
import { seasonBoard } from "./season.ts";
import { newCareer, nextRaceSeed } from "./state.ts";

describe("the season board", () => {
  it("ranks by points, then wins, then whoever most recently placed better", () => {
    const first = enter(newCareer(4), "slag-row", 1);
    sprint(first, 3, ["moose-kowalczyk", "dee-santangelo"]);
    const second = enter(settle(first).career, "slag-row", 2);
    sprint(second, 3, ["dee-santangelo", "moose-kowalczyk"]);
    const board = seasonBoard(settle(second).career);
    expect(board.slice(0, 3)).toStrictEqual([
      { points: 29, racer: "dee-santangelo", rank: 1, wins: 1 },
      { points: 29, racer: "moose-kowalczyk", rank: 2, wins: 1 },
      { points: 26, racer: "player", rank: 3, wins: 0 },
    ]);
  });
});

describe("the bar", () => {
  it("the home rider with the most wins on the season holds the road, the best rider until someone wins", () => {
    const career = newCareer(4);
    expect(roadBoss(career, "slag-row")).toBe("dee-santangelo");
    const race = enter(career, "slag-row", 1);
    sprint(race, 3, ["moose-kowalczyk"]);
    expect(roadBoss(settle(race).career, "slag-row")).toBe("moose-kowalczyk");
  });
});

describe("race seeds", () => {
  it("each start draws the next seed from the career's own, the same way every time", () => {
    const career = newCareer(99);
    const afterOne = lastOf(wreckTimes(career, 1)).career;
    expect([
      nextRaceSeed(career) === nextRaceSeed(newCareer(99)),
      nextRaceSeed(career) === nextRaceSeed(afterOne),
      nextRaceSeed(career) === nextRaceSeed(newCareer(100)),
    ]).toStrictEqual([true, false, false]);
  });
});
