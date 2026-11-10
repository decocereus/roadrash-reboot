import { recordedRules } from "@racer/career/bench";
import { abandonedOutcome } from "@racer/career/outcome";
import type { RaceResult } from "@racer/career/outcome";
import { settleRace, startRace } from "@racer/career/settle";
import { newCareer } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { vi } from "vitest";

import {
  careerEntry,
  firstQuickPick,
  planFor,
  quickEntry,
  quickReport,
} from "../src/career/flow.ts";
import type { RaceReport } from "../src/career/flow.ts";
import type { SaveStorage } from "../src/career/save-storage.ts";
import { settledRace } from "../src/career/save.ts";
import type { SaveState } from "../src/career/save.ts";
import type { RacePlan } from "../src/game/hud.ts";
import { stepNavigation } from "../src/navigation.ts";
import type { NavigationEvent, RoomVisit, View } from "../src/navigation.ts";
import type { RulesLoad } from "../src/rules/load.ts";
import { RulesRequestFailed } from "../src/rules/rules-request-failed.ts";
import { roomRunStub } from "./room-run-stub.ts";

const SEED = 31;
const ROAD = "breakwater-run";
export const ROOM_ID = "room-one";

export const rulesReady: RulesLoad = { rules: recordedRules, status: "ready" };
export const rulesFailed: RulesLoad = {
  failure: new RulesRequestFailed({
    cause: new Error("offline"),
    message: "The server would not answer.",
  }),
  status: "failed",
};

export const fresh: CareerState = newCareer(SEED);

const writable: SaveStorage = {
  getItem: () => null,
  removeItem: vi.fn<SaveStorage["removeItem"]>(),
  setItem: vi.fn<SaveStorage["setItem"]>(),
};

const settledCareer = () => {
  const begun = startRace(fresh, ROAD, SEED);
  if (!begun.started || !begun.career.activeRace) {
    throw new Error("A new career starts its first road.");
  }
  const settled = settledRace(
    () => writable,
    settleRace(
      begun.career,
      abandonedOutcome(recordedRules, begun.career.activeRace)
    )
  );
  if (settled === null) {
    throw new Error("A race that started settles.");
  }
  return { career: settled.save.career, report: settled.report };
};

export const { career: raced, report: careerResult } = settledCareer();

const withLedger = (
  change: Partial<NonNullable<RaceReport["ledger"]>>
): RaceReport => {
  if (!careerResult.ledger) {
    throw new Error("A career race has a ledger.");
  }
  return { ...careerResult, ledger: { ...careerResult.ledger, ...change } };
};

export const promotion = { bikes: [], tier: 2 } as const;
export const promoted = withLedger({ tierUp: promotion });
export const broke = withLedger({ gameOver: true });
export const crowned = withLedger({ ending: "clean-crown" });

export const toCareerRace = careerEntry(fresh, ROAD);
export const toSingleRace = quickEntry(firstQuickPick, SEED);
export const careerPlan: RacePlan = planFor(recordedRules, fresh, toCareerRace);
export const singlePlan: RacePlan = planFor(recordedRules, null, toSingleRace);
export const roomPlan: RacePlan = {
  ...singlePlan,
  room: roomRunStub(singlePlan.setup, ROOM_ID),
};
export const linkVisit: RoomVisit = {
  arrival: "link",
  rejoin: null,
  roomId: ROOM_ID,
};
export const roomLobby: View = { screen: "room", turn: 0, visit: linkVisit };

export const singleResult: RaceReport = quickReport(
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

export const roomResult: RaceReport = {
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

export const entered = (
  rules: RulesLoad | null,
  save: SaveState,
  room: RoomVisit | null = null,
  urlRide = false
): NavigationEvent => ({ kind: "entered", room, rules, save, urlRide });

export const readySave = (career: CareerState): SaveState => ({
  career,
  leftRace: null,
  status: "ready",
  unsaved: false,
});

export const LOADING: SaveState = { status: "loading" };
export const EMPTY: SaveState = { status: "empty" };
export const UNREAD: SaveState = { status: "unread" };
export const ELSEWHERE: SaveState = { status: "elsewhere" };
export const CORRUPT: SaveState = {
  error: { field: "", kind: "wrongVersion" },
  status: "corrupt",
};

export const leftWith = (save: SaveState): NavigationEvent => ({
  kind: "left",
  save,
});

export const LEFT: NavigationEvent = leftWith(readySave(fresh));

export const settled = (
  result: RaceResult,
  report: RaceReport | null
): NavigationEvent => ({ kind: "raceSettled", report, result });

export const nameOf = (view: View): string =>
  view.screen === "race" ? `race/${view.stage.kind}` : view.screen;

export const walk = (first: View, ...events: readonly NavigationEvent[]) => {
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

export const racing = (
  plan: RacePlan
): Extract<View, { readonly screen: "race" }> => ({
  plan,
  screen: "race",
  stage: { kind: "riding" },
});

export const picked = (screen: "garage" | "queue" | "routeBoard") =>
  nameOf(
    stepNavigation({ screen: "clubhouse" }, { kind: "picked", screen }).state
  );

export const backRoomHome = (career: CareerState | null) =>
  nameOf(
    stepNavigation(
      { screen: "backRoom" },
      leftWith(career ? readySave(career) : EMPTY)
    ).state
  );

export const afterResultsOf = (report: RaceReport) =>
  stepNavigation({ report, screen: "results" }, LEFT).state;

export const fallenTrail = (plan: RacePlan) =>
  walk(racing(plan), settled("busted", null), { kind: "raceOver" }).trail;

export const quitTo = (plan: RacePlan, report: RaceReport | null) =>
  walk(racing(plan), { kind: "paused" }, settled("quit", report), {
    kind: "raceOver",
  }).trail.at(-1);

const everyScreen = {
  backRoom: { screen: "backRoom" },
  boot: { screen: "boot" },
  clubhouse: { screen: "clubhouse" },
  elsewhere: { screen: "elsewhere" },
  ending: { screen: "ending" },
  gameOver: { screen: "gameOver" },
  garage: { screen: "garage" },
  queue: { screen: "queue" },
  race: racing(careerPlan),
  results: { report: careerResult, screen: "results" },
  rideOut: { entry: toCareerRace, screen: "rideOut" },
  room: roomLobby,
  routeBoard: { screen: "routeBoard" },
} as const satisfies Record<View["screen"], View>;

export const screens = Object.values(everyScreen);
