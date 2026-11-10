import { describe, expect, it } from "vitest";

import {
  firstView,
  raceAgainOffered,
  stageOf,
  stepNavigation,
} from "../src/navigation.ts";
import type { NavigationEvent } from "../src/navigation.ts";
import {
  afterResultsOf,
  backRoomHome,
  broke,
  careerPlan,
  careerResult,
  CORRUPT,
  crowned,
  ELSEWHERE,
  EMPTY,
  entered,
  fallenTrail,
  fresh,
  LEFT,
  linkVisit,
  LOADING,
  nameOf,
  picked,
  promoted,
  promotion,
  quitTo,
  raced,
  racing,
  readySave,
  roomLobby,
  roomResult,
  rulesFailed,
  rulesReady,
  screens,
  settled,
  singlePlan,
  singleResult,
  toCareerRace,
  toSingleRace,
  UNREAD,
  walk,
} from "./navigation-walk.ts";

describe("the way into the game", () => {
  it("holds the boot screen until the rules and the save are both in", () => {
    const { trail, effects } = walk(
      firstView(),
      entered(null, LOADING),
      entered(rulesReady, LOADING)
    );
    expect(trail).toStrictEqual(["boot", "boot"]);
    expect(effects).toStrictEqual([]);
  });

  it("begins a career on an empty save and opens the bar once its art decodes", () => {
    const { at, effects, trail } = walk(
      firstView(),
      entered(rulesReady, EMPTY),
      entered(rulesReady, readySave(fresh)),
      { kind: "barDecoded" }
    );
    expect(trail).toStrictEqual(["boot", "boot", "clubhouse"]);
    expect(effects).toStrictEqual(["beginCareer", "decodeBar"]);
    expect(at).toStrictEqual({ screen: "clubhouse" });
  });

  it("opens a finished career on its last screen, with no bar art to decode", () => {
    const over = { ...fresh, gameOver: true };
    const ended = {
      ...fresh,
      story: { ...fresh.story, ending: "clean-crown" as const },
    };
    expect(
      walk(firstView(), entered(rulesReady, readySave(over)))
    ).toMatchObject({ effects: [], trail: ["gameOver"] });
    expect(
      walk(firstView(), entered(rulesReady, readySave(ended)))
    ).toMatchObject({ effects: [], trail: ["ending"] });
  });

  it("seats a room link whatever the save says", () => {
    for (const save of [EMPTY, CORRUPT, UNREAD, ELSEWHERE, readySave(fresh)]) {
      expect(
        walk(firstView(), entered(rulesReady, save, linkVisit))
      ).toStrictEqual({ at: roomLobby, effects: [], trail: ["room"] });
    }
  });

  it("stops at the back room for a damaged or unread save", () => {
    for (const save of [CORRUPT, UNREAD]) {
      expect(walk(firstView(), entered(rulesReady, save))).toMatchObject({
        effects: [],
        trail: ["backRoom"],
      });
    }
  });

  it("stops a tab whose career is open in another tab, with no way on and no career begun", () => {
    const { effects, trail } = walk(
      firstView(),
      entered(rulesReady, ELSEWHERE),
      LEFT
    );
    expect(trail).toStrictEqual(["elsewhere", "elsewhere"]);
    expect(effects).toStrictEqual([]);
  });

  it("stops at the back room when the rules fail, ahead of a room or a URL ride", () => {
    expect(
      walk(firstView(), entered(rulesFailed, LOADING, linkVisit, true)).trail
    ).toStrictEqual(["backRoom"]);
  });

  it("holds a URL ride at boot until the game starts it, ahead of a room or a save", () => {
    const { effects, trail } = walk(
      firstView(),
      entered(rulesReady, EMPTY, linkVisit, true),
      { kind: "raceBegun", plan: singlePlan }
    );
    expect(trail).toStrictEqual(["boot", "race/riding"]);
    expect(effects).toStrictEqual([]);
  });

  it("reads the entrance only at boot", () => {
    for (const view of screens.filter(({ screen }) => screen !== "boot")) {
      expect(
        stepNavigation(view, entered(rulesFailed, CORRUPT, linkVisit)).state
      ).toBe(view);
    }
  });
});

describe("leaving each screen", () => {
  it("has one way out per screen", () => {
    const outs = Object.fromEntries(
      screens.map((view) => {
        const { effect, state } = stepNavigation(view, LEFT);
        return [view.screen, effect ? effect.kind : nameOf(state)];
      })
    );
    expect(outs).toStrictEqual({
      backRoom: "clubhouse",
      boot: "boot",
      clubhouse: "backRoom",
      elsewhere: "elsewhere",
      ending: "backRoom",
      gameOver: "backRoom",
      garage: "clubhouse",
      queue: "clubhouse",
      race: "race/riding",
      results: "clubhouse",
      rideOut: "clubhouse",
      room: "clubhouse",
      routeBoard: "backRoom",
    });
  });

  it("sends the back room home to the screen the career has reached", () => {
    expect(backRoomHome(null)).toBe("backRoom");
    expect(backRoomHome(fresh)).toBe("clubhouse");
    expect(backRoomHome({ ...fresh, gameOver: true })).toBe("gameOver");
    expect(
      backRoomHome({ ...fresh, story: { ...fresh.story, ending: "runner-up" } })
    ).toBe("ending");
  });

  it("backs out of a single race's ride-out card to the route board", () => {
    expect(
      walk({ entry: toSingleRace, screen: "rideOut" }, LEFT).trail
    ).toStrictEqual(["routeBoard"]);
  });

  it("moves on from results to where the race left the career", () => {
    expect(afterResultsOf(careerResult)).toStrictEqual({ screen: "clubhouse" });
    expect(afterResultsOf(singleResult)).toStrictEqual({
      screen: "routeBoard",
    });
    expect(afterResultsOf(broke)).toStrictEqual({ screen: "gameOver" });
    expect(afterResultsOf(crowned)).toStrictEqual({ screen: "ending" });
    expect(afterResultsOf(promoted)).toStrictEqual({
      promotion,
      screen: "clubhouse",
    });
  });
});

describe("the menus", () => {
  it("opens the screen each menu names", () => {
    expect(picked("garage")).toBe("garage");
    expect(picked("queue")).toBe("queue");
    expect(picked("routeBoard")).toBe("routeBoard");
  });

  it("starts a new career at the bar", () => {
    expect(
      walk({ screen: "gameOver" }, { kind: "careerBegun" }).at
    ).toStrictEqual({ screen: "clubhouse" });
    expect(
      walk({ screen: "backRoom" }, { kind: "careerBegun" }).at
    ).toStrictEqual({ screen: "clubhouse" });
  });

  it("goes home when the career refuses the race at the green light", () => {
    expect(walk(racing(careerPlan), { kind: "raceRefused" }).at).toStrictEqual({
      screen: "clubhouse",
    });
  });

  it("leaves a garage visit with no promotion left to say", () => {
    const { at, trail } = walk(
      { promotion, screen: "clubhouse" },
      { kind: "picked", screen: "garage" },
      LEFT
    );
    expect(trail).toStrictEqual(["garage", "clubhouse"]);
    expect(at).toStrictEqual({ screen: "clubhouse" });
  });
});

describe("a race", () => {
  it("walks a career from the bar through a win and back to the bar", () => {
    const { at, effects, trail } = walk(
      firstView(),
      entered(rulesReady, readySave(fresh)),
      { kind: "barDecoded" },
      { entry: toCareerRace, kind: "ridePicked" },
      { kind: "raceBegun", plan: careerPlan },
      { kind: "paused" },
      { kind: "resumed" },
      settled("finished", careerResult),
      { kind: "raceOver" },
      LEFT,
      LEFT
    );
    expect(trail).toStrictEqual([
      "boot",
      "clubhouse",
      "rideOut",
      "race/riding",
      "race/paused",
      "race/riding",
      "race/finishing",
      "race/finishing",
      "results",
      "clubhouse",
    ]);
    expect(effects).toStrictEqual(["decodeBar"]);
    expect(at).toStrictEqual({ screen: "clubhouse" });
  });

  it("carries a wreck's report through the consequence to results", () => {
    const { at, trail } = walk(
      racing(careerPlan),
      settled("wrecked", careerResult),
      LEFT,
      { kind: "raceOver" }
    );
    expect(trail).toStrictEqual([
      "race/consequence",
      "race/consequence",
      "results",
    ]);
    expect(at).toStrictEqual({ report: careerResult, screen: "results" });
  });

  it("goes home from a finish the career refused to pay", () => {
    expect(
      walk(racing(careerPlan), settled("finished", null), {
        kind: "raceOver",
      }).at
    ).toStrictEqual({ screen: "clubhouse" });
  });

  it("goes home from a bust with no report, by the race's mode", () => {
    expect(fallenTrail(careerPlan)).toStrictEqual([
      "race/consequence",
      "clubhouse",
    ]);
    expect(fallenTrail(singlePlan)).toStrictEqual([
      "race/consequence",
      "routeBoard",
    ]);
  });

  it("takes no report from one race into its restart", () => {
    const { at, trail } = walk(
      racing(singlePlan),
      { kind: "paused" },
      { kind: "raceBegun", plan: singlePlan },
      { kind: "raceOver" }
    );
    expect(trail).toStrictEqual(["race/paused", "race/riding", "race/riding"]);
    expect(at).toStrictEqual(racing(singlePlan));
  });

  it("settles a quit with the bill's report, or goes home without one", () => {
    expect(quitTo(careerPlan, careerResult)).toBe("results");
    expect(quitTo(careerPlan, null)).toBe("clubhouse");
    expect(quitTo(singlePlan, null)).toBe("routeBoard");
  });

  it("ignores race news on every other screen", () => {
    const news: readonly NavigationEvent[] = [
      { kind: "paused" },
      { kind: "resumed" },
      settled("finished", careerResult),
      settled("wrecked", careerResult),
      { kind: "raceOver" },
    ];
    for (const view of screens.filter(({ screen }) => screen !== "race")) {
      for (const event of news) {
        expect(stepNavigation(view, event)).toStrictEqual({
          effect: null,
          state: view,
        });
      }
    }
  });

  it("runs the game only on the race screen", () => {
    const stages = screens.map((view) => [view.screen, stageOf(view)]);
    expect(Object.fromEntries(stages)).toMatchObject({
      backRoom: "menu",
      boot: "boot",
      race: "race",
      results: "menu",
    });
  });
});

describe("race again", () => {
  it("is always on offer after a race with no ledger", () => {
    expect(raceAgainOffered(singleResult, null)).toBeTruthy();
    expect(raceAgainOffered(roomResult, raced)).toBeTruthy();
  });

  it("is on offer after a career race only when the bar comes back as it was", () => {
    expect(raceAgainOffered(careerResult, raced)).toBeTruthy();
    expect(raceAgainOffered(careerResult, null)).toBeFalsy();
    expect(raceAgainOffered(promoted, raced)).toBeFalsy();
    expect(raceAgainOffered(broke, raced)).toBeFalsy();
    expect(raceAgainOffered(crowned, raced)).toBeFalsy();
  });

  it("is not on offer when the road has closed", () => {
    const finale = { ...careerResult, roadId: "ridge-road" as const };
    expect(raceAgainOffered(finale, { ...raced, tier: 3 })).toBeFalsy();
  });

  it("opens the ride-out card outside a room", () => {
    expect(
      walk(
        { report: careerResult, screen: "results" },
        { entry: toCareerRace, kind: "ridePicked" }
      ).at
    ).toStrictEqual({ entry: toCareerRace, screen: "rideOut" });
  });
});
