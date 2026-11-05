import { recordedRules } from "@racer/career/bench";
import { abandonedOutcome } from "@racer/career/outcome";
import type { RaceResult } from "@racer/career/outcome";
import { settleRace, startRace } from "@racer/career/settle";
import { newCareer } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { describe, expect, it } from "vitest";

import {
  careerEntry,
  careerReport,
  firstQuickPick,
  planFor,
  quickEntry,
  quickReport,
} from "../src/career/flow.ts";
import type { RaceReport } from "../src/career/flow.ts";
import type { SaveState } from "../src/career/save.ts";
import type { RacePlan } from "../src/game/hud.ts";
import {
  firstView,
  raceAgainOffered,
  stageOf,
  stepNavigation,
} from "../src/navigation.ts";
import type { NavigationEvent, View } from "../src/navigation.ts";
import type { RulesLoad } from "../src/rules/load.ts";
import { RulesRequestFailed } from "../src/rules/rules-request-failed.ts";

const SEED = 31;
const ROAD = "breakwater-run";
const ROOM_ID = "room-one";

const rulesReady: RulesLoad = { rules: recordedRules, status: "ready" };
const rulesFailed: RulesLoad = {
  failure: new RulesRequestFailed({
    cause: new Error("offline"),
    message: "The server would not answer.",
  }),
  status: "failed",
};

const fresh: CareerState = newCareer(SEED);

const settledCareer = () => {
  const begun = startRace(fresh, ROAD, SEED);
  if (!begun.started || !begun.career.activeRace) {
    throw new Error("A new career starts its first road.");
  }
  const settlement = settleRace(
    begun.career,
    abandonedOutcome(recordedRules, begun.career.activeRace)
  );
  if (!settlement.settled || !settlement.career.lastResult) {
    throw new Error("A race that started settles.");
  }
  return {
    career: settlement.career,
    report: careerReport(settlement.career.lastResult),
  };
};

const { career: raced, report: careerResult } = settledCareer();

const withLedger = (
  change: Partial<NonNullable<RaceReport["ledger"]>>
): RaceReport => {
  if (!careerResult.ledger) {
    throw new Error("A career race has a ledger.");
  }
  return { ...careerResult, ledger: { ...careerResult.ledger, ...change } };
};

const promotion = { bikes: [], tier: 2 } as const;
const promoted = withLedger({ tierUp: promotion });
const broke = withLedger({ gameOver: true });
const crowned = withLedger({ ending: "clean-crown" });

const toCareerRace = careerEntry(fresh, ROAD);
const toSingleRace = quickEntry(firstQuickPick, SEED);
const careerPlan: RacePlan = planFor(recordedRules, fresh, toCareerRace);
const singlePlan: RacePlan = planFor(recordedRules, null, toSingleRace);

const singleResult: RaceReport = quickReport(
  singlePlan,
  abandonedOutcome(recordedRules, {
    bikeId: firstQuickPick.bikeId,
    raceId: singlePlan.setup.raceId,
    roadId: singlePlan.setup.roadId,
    seed: SEED,
    started: true,
    tier: singlePlan.setup.tier,
  })
);

const roomResult: RaceReport = {
  ...singleResult,
  room: {
    colours: new Map(),
    myColour: undefined,
    names: new Map(),
    net: {
      inputToFrame: { medianMs: 0, samples: 0, worstMs: 0 },
      resimulatedPerSecond: 0,
      rollbacks: 0,
      roundTripMs: 0,
      worstRoundTripMs: 0,
    },
    raceId: "race-one",
    roomId: ROOM_ID,
  },
};

const entered = (
  rules: RulesLoad | null,
  save: SaveState,
  roomId: string | null = null,
  urlRide = false
): NavigationEvent => ({ kind: "entered", roomId, rules, save, urlRide });

const readySave = (career: CareerState): SaveState => ({
  career,
  leftRace: null,
  status: "ready",
  unsaved: false,
});

const LOADING: SaveState = { status: "loading" };
const EMPTY: SaveState = { status: "empty" };
const UNREAD: SaveState = { status: "unread" };
const CORRUPT: SaveState = {
  error: { field: "", kind: "wrongVersion" },
  status: "corrupt",
};

const LEFT: NavigationEvent = { career: fresh, kind: "left" };

const settled = (
  result: RaceResult,
  report: RaceReport | null
): NavigationEvent => ({ kind: "raceSettled", report, result });

const nameOf = (view: View): string =>
  view.screen === "race" ? `race/${view.stage.kind}` : view.screen;

const walk = (first: View, ...events: readonly NavigationEvent[]) => {
  let at = first;
  const trail: string[] = [];
  const effects: string[] = [];
  for (const event of events) {
    const { effect, state } = stepNavigation(at, event);
    at = state;
    trail.push(nameOf(state));
    if (effect) {
      effects.push(effect.kind);
    }
  }
  return { at, effects, trail };
};

const racing = (plan: RacePlan): View => ({
  plan,
  screen: "race",
  stage: { kind: "riding" },
});

const picked = (screen: "garage" | "queue" | "routeBoard") =>
  nameOf(
    stepNavigation({ screen: "clubhouse" }, { kind: "picked", screen }).state
  );

const backRoomHome = (career: CareerState | null) =>
  nameOf(
    stepNavigation({ screen: "backRoom" }, { career, kind: "left" }).state
  );

const afterResultsOf = (report: RaceReport) =>
  stepNavigation({ report, screen: "results" }, LEFT).state;

const fallenTrail = (plan: RacePlan) =>
  walk(racing(plan), settled("busted", null), { kind: "raceOver" }).trail;

const quitTo = (plan: RacePlan, report: RaceReport | null) =>
  walk(racing(plan), { kind: "paused" }, settled("quit", report), {
    kind: "raceOver",
  }).trail.at(-1);

const everyScreen = {
  backRoom: { screen: "backRoom" },
  boot: { screen: "boot" },
  clubhouse: { screen: "clubhouse" },
  ending: { screen: "ending" },
  gameOver: { screen: "gameOver" },
  garage: { screen: "garage" },
  queue: { screen: "queue" },
  race: racing(careerPlan),
  results: { report: careerResult, screen: "results" },
  rideOut: { entry: toCareerRace, screen: "rideOut" },
  room: { roomId: ROOM_ID, screen: "room" },
  routeBoard: { screen: "routeBoard" },
} as const satisfies Record<View["screen"], View>;

const screens = Object.values(everyScreen);

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
    for (const save of [EMPTY, CORRUPT, UNREAD, readySave(fresh)]) {
      expect(
        walk(firstView(), entered(rulesReady, save, ROOM_ID))
      ).toMatchObject({
        at: { roomId: ROOM_ID, screen: "room" },
        effects: [],
      });
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

  it("stops at the back room when the rules fail, ahead of a room or a URL ride", () => {
    expect(
      walk(firstView(), entered(rulesFailed, LOADING, ROOM_ID, true)).trail
    ).toStrictEqual(["backRoom"]);
  });

  it("holds a URL ride at boot until the game starts it, ahead of a room or a save", () => {
    const { effects, trail } = walk(
      firstView(),
      entered(rulesReady, EMPTY, ROOM_ID, true),
      { kind: "raceBegun", plan: singlePlan }
    );
    expect(trail).toStrictEqual(["boot", "race/riding"]);
    expect(effects).toStrictEqual([]);
  });

  it("reads the entrance only at boot", () => {
    for (const view of screens.filter(({ screen }) => screen !== "boot")) {
      expect(
        stepNavigation(view, entered(rulesFailed, CORRUPT, ROOM_ID)).state
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
      ending: "backRoom",
      gameOver: "backRoom",
      garage: "clubhouse",
      queue: "clubhouse",
      race: "race/riding",
      results: "clubhouse",
      rideOut: "clubhouse",
      room: "openBar",
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

describe("a room's race", () => {
  const roomResults: View = { report: roomResult, screen: "results" };

  it("leaves results for the bar with a fresh page", () => {
    expect(stepNavigation(roomResults, LEFT)).toStrictEqual({
      effect: { kind: "openBar" },
      state: roomResults,
    });
  });

  it("goes back to the same lobby for a rematch", () => {
    expect(
      stepNavigation(roomResults, { entry: toSingleRace, kind: "ridePicked" })
    ).toStrictEqual({
      effect: { kind: "rematch", roomId: ROOM_ID },
      state: roomResults,
    });
  });

  it("walks an invite link from the lobby to the results", () => {
    const { at, trail } = walk(
      firstView(),
      entered(rulesReady, EMPTY, ROOM_ID),
      { kind: "raceBegun", plan: singlePlan },
      settled("finished", roomResult),
      LEFT
    );
    expect(trail).toStrictEqual([
      "room",
      "race/riding",
      "race/finishing",
      "results",
    ]);
    expect(at).toStrictEqual(roomResults);
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
