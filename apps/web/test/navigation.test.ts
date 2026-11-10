import { describe, expect, it } from "vitest";

import {
  barTabs,
  firstView,
  graphicsPlaceOf,
  raceAgainOffered,
  stageOf,
  stepNavigation,
} from "../src/navigation.ts";
import type { NavigationEvent, View } from "../src/navigation.ts";
import {
  afterResultsOf,
  barAt,
  broke,
  careerPlan,
  careerResult,
  CORRUPT,
  crowned,
  ELSEWHERE,
  EMPTY,
  entered,
  fallenTrail,
  finding,
  fresh,
  home,
  invite,
  LEFT,
  leftWith,
  linkVisit,
  LOADING,
  nameOf,
  panels,
  promoted,
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
  solo,
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

  it("begins a career on an empty save and opens the bar at home", () => {
    const { at, effects, trail } = walk(
      firstView(),
      entered(rulesReady, EMPTY),
      entered(rulesReady, readySave(fresh))
    );
    expect(trail).toStrictEqual(["boot", "bar/home"]);
    expect(effects).toStrictEqual(["beginCareer"]);
    expect(at).toStrictEqual(home);
  });

  it("opens the bar at home on every save it can read, a finished career included", () => {
    const over = { ...fresh, gameOver: true };
    const ended = {
      ...fresh,
      story: { ...fresh.story, ending: "clean-crown" as const },
    };
    for (const save of [
      readySave(fresh),
      readySave(over),
      readySave(ended),
      CORRUPT,
      UNREAD,
    ]) {
      expect(walk(firstView(), entered(rulesReady, save))).toStrictEqual({
        at: home,
        effects: [],
        trail: ["bar/home"],
      });
    }
  });

  it("opens the bar at home when the rules fail, ahead of a room or a URL ride", () => {
    expect(
      walk(firstView(), entered(rulesFailed, LOADING, linkVisit, true)).trail
    ).toStrictEqual(["bar/home"]);
  });

  it("seats a room link in the bar's lobby whatever the save says", () => {
    for (const save of [EMPTY, CORRUPT, UNREAD, ELSEWHERE, readySave(fresh)]) {
      expect(
        walk(firstView(), entered(rulesReady, save, linkVisit))
      ).toStrictEqual({ at: roomLobby, effects: [], trail: ["bar/lobby"] });
    }
  });

  it("shows a friend's link as an invite until the player answers it", () => {
    expect(
      walk(
        firstView(),
        entered(rulesReady, readySave(fresh), linkVisit, false, true)
      )
    ).toStrictEqual({ at: invite, effects: [], trail: ["bar/invite"] });
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

describe("the bar", () => {
  it("walks every panel of the Race tab and back home", () => {
    const { at, trail } = walk(
      home,
      { kind: "picked", panel: "solo" },
      LEFT,
      { kind: "picked", panel: "finding" },
      {
        kind: "roomMoved",
        visit: { arrival: "queue", rejoin: null, roomId: "pub-one" },
      },
      LEFT,
      {
        kind: "roomMoved",
        visit: { arrival: "made", rejoin: null, roomId: "room-two" },
      },
      LEFT
    );
    expect(trail).toStrictEqual([
      "bar/solo",
      "bar/home",
      "bar/finding",
      "bar/lobby",
      "bar/home",
      "bar/lobby",
      "bar/home",
    ]);
    expect(at).toStrictEqual(home);
  });

  it("cancels the queue back home", () => {
    expect(walk(finding, LEFT).at).toStrictEqual(home);
  });

  it("joins from an invite into the same room, or turns it down for home", () => {
    expect(walk(invite, { kind: "joined" }).at).toStrictEqual(roomLobby);
    expect(walk(invite, LEFT).at).toStrictEqual(home);
  });

  it("opens Garage and Settings from every panel and keeps the panel under them", () => {
    for (const view of panels) {
      for (const tab of barTabs) {
        expect(
          stepNavigation(view, { kind: "tabbed", tab }).state
        ).toStrictEqual({ ...view, tab });
      }
    }
  });

  it("leaves Garage or Settings for the Race tab with the panel as it was", () => {
    for (const view of panels) {
      for (const tab of ["garage", "settings"] as const) {
        expect(walk({ ...view, tab }, LEFT).at).toStrictEqual(view);
      }
    }
  });

  it("keeps the tab when the queue places the player", () => {
    const placed = {
      kind: "roomMoved",
      visit: { arrival: "queue", rejoin: null, roomId: "pub-one" },
    } as const;
    expect(
      stepNavigation({ ...finding, tab: "settings" }, placed).state
    ).toStrictEqual({
      ...barAt({ kind: "lobby", turn: 0, visit: placed.visit }),
      tab: "settings",
    });
  });

  it("takes the player to the door on the Race tab whatever tab is open", () => {
    for (const tab of barTabs) {
      expect(
        stepNavigation({ ...roomLobby, tab }, { kind: "doorOpened" }).state
      ).toStrictEqual(roomLobby);
    }
  });

  it("picks a panel only from home or Ride solo", () => {
    for (const view of [finding, invite, roomLobby]) {
      expect(
        stepNavigation(view, { kind: "picked", panel: "solo" }).state
      ).toBe(view);
    }
  });

  it("stays home when home is left", () => {
    expect(walk(home, LEFT).at).toBe(home);
  });

  it("starts a new career in place, from Settings or Ride solo", () => {
    for (const view of [solo, { ...roomLobby, tab: "settings" as const }]) {
      expect(stepNavigation(view, { kind: "careerBegun" }).state).toBe(view);
    }
  });

  it("goes home when the career refuses the race at the green light", () => {
    expect(walk(racing(careerPlan), { kind: "raceRefused" }).at).toStrictEqual(
      home
    );
  });
});

describe("leaving each screen", () => {
  it("has one way out per screen", () => {
    const outs = Object.fromEntries(
      screens.map((view) => [
        nameOf(view),
        nameOf(stepNavigation(view, LEFT).state),
      ])
    );
    expect(outs).toStrictEqual({
      "bar/finding": "bar/home",
      "bar/finding/garage": "bar/finding",
      "bar/finding/settings": "bar/finding",
      "bar/home": "bar/home",
      "bar/home/garage": "bar/home",
      "bar/home/settings": "bar/home",
      "bar/invite": "bar/home",
      "bar/invite/garage": "bar/invite",
      "bar/invite/settings": "bar/invite",
      "bar/lobby": "bar/home",
      "bar/lobby/garage": "bar/lobby",
      "bar/lobby/settings": "bar/lobby",
      "bar/solo": "bar/home",
      "bar/solo/garage": "bar/solo",
      "bar/solo/settings": "bar/solo",
      boot: "boot",
      elsewhere: "elsewhere",
      ending: "bar/home",
      gameOver: "bar/home",
      "race/riding": "race/riding",
      results: "bar/home",
      rideOut: "bar/solo",
    });
  });

  it("backs out of a ride-out card to Ride solo", () => {
    expect(
      walk({ entry: toSingleRace, screen: "rideOut" }, LEFT).at
    ).toStrictEqual(solo);
  });

  it("moves on from results to where the race left the career", () => {
    expect(afterResultsOf(careerResult)).toStrictEqual(home);
    expect(afterResultsOf(promoted)).toStrictEqual(home);
    expect(afterResultsOf(broke)).toStrictEqual({ screen: "gameOver" });
    expect(afterResultsOf(crowned)).toStrictEqual({ screen: "ending" });
    expect(afterResultsOf(singleResult)).toStrictEqual(home);
  });

  it("begins a career when a lobby is left on an empty save", () => {
    expect(walk(roomLobby, leftWith(EMPTY))).toStrictEqual({
      at: home,
      effects: ["beginCareer"],
      trail: ["bar/home"],
    });
  });
});

describe("a race", () => {
  it("walks a career from the bar through a win and back to the bar", () => {
    const { at, effects, trail } = walk(
      firstView(),
      entered(rulesReady, readySave(fresh)),
      { kind: "picked", panel: "solo" },
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
      "bar/home",
      "bar/solo",
      "rideOut",
      "race/riding",
      "race/paused",
      "race/riding",
      "race/finishing",
      "race/finishing",
      "results",
      "bar/home",
    ]);
    expect(effects).toStrictEqual([]);
    expect(at).toStrictEqual(home);
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
    ).toStrictEqual(home);
  });

  it("goes home from a bust with no report, whatever the race's mode", () => {
    expect(fallenTrail(careerPlan)).toStrictEqual([
      "race/consequence",
      "bar/home",
    ]);
    expect(fallenTrail(singlePlan)).toStrictEqual([
      "race/consequence",
      "bar/home",
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
    expect(quitTo(careerPlan, null)).toBe("bar/home");
    expect(quitTo(singlePlan, null)).toBe("bar/home");
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

  it("runs the game only on the race screen and counts the bar as its own place", () => {
    const stages = screens.map((view) => [view.screen, stageOf(view)]);
    expect(Object.fromEntries(stages)).toMatchObject({
      bar: "menu",
      boot: "boot",
      race: "race",
      results: "menu",
    });
    expect(graphicsPlaceOf.bar).toBe("bar");
  });

  it("ignores bar events away from the bar", () => {
    const barNews: readonly NavigationEvent[] = [
      { kind: "tabbed", tab: "settings" },
      { kind: "picked", panel: "solo" },
      { kind: "joined" },
      { kind: "doorOpened" },
    ];
    const away: readonly View[] = screens.filter(
      ({ screen }) => screen !== "bar"
    );
    for (const view of away) {
      for (const event of barNews) {
        expect(stepNavigation(view, event).state).toBe(view);
      }
    }
  });
});

describe("race again", () => {
  it("is always on offer after a race with no ledger", () => {
    expect(raceAgainOffered(singleResult, null)).toBeTruthy();
    expect(raceAgainOffered(roomResult, raced)).toBeTruthy();
  });

  it("is on offer after a career race only when the career carries on as it was", () => {
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
