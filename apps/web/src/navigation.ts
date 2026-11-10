import { roadOpen } from "@racer/career/field";
import type { RaceResult } from "@racer/career/outcome";
import type { RaceRules } from "@racer/career/rules";
import type { TierUp } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import type { GraphicsPlace, RoomArrival } from "@racer/telemetry/limits";

import type { RaceEntry, RaceReport } from "./career/flow.ts";
import type { SaveState } from "./career/save.ts";
import type { RoomAddress } from "./components/room-url.ts";
import type { RacePlan } from "./game/hud.ts";
import type { Step } from "./race-handoff.ts";
import type { RulesLoad } from "./rules/load.ts";

const rejoinChoices = ["try", "no", "taken", "flooded"] as const;

export type RejoinChoice = (typeof rejoinChoices)[number];

export interface RoomVisit {
  readonly roomId: string;
  readonly arrival: RoomArrival;
  readonly rejoin: RejoinChoice | null;
}

export type RaceStage =
  | { readonly kind: "riding" }
  | { readonly kind: "paused" }
  | { readonly kind: "signalLost"; readonly lostAt: number }
  | { readonly kind: "finishing"; readonly report: RaceReport }
  | { readonly kind: "consequence"; readonly report: RaceReport | null };

export type View =
  | { readonly screen: "boot" }
  | { readonly screen: "elsewhere" }
  | { readonly screen: "clubhouse"; readonly promotion?: TierUp }
  | { readonly screen: "backRoom" }
  | { readonly screen: "routeBoard" }
  | { readonly screen: "garage" }
  | { readonly screen: "rideOut"; readonly entry: RaceEntry }
  | { readonly screen: "queue" }
  | {
      readonly screen: "room";
      readonly visit: RoomVisit;
      readonly turn: number;
    }
  | {
      readonly screen: "race";
      readonly plan: RacePlan;
      readonly stage: RaceStage;
    }
  | { readonly screen: "results"; readonly report: RaceReport }
  | { readonly screen: "ending" }
  | { readonly screen: "gameOver" };

type RaceNews =
  | { readonly kind: "paused" }
  | { readonly kind: "resumed" }
  | { readonly kind: "signalLost"; readonly lostAt: number }
  | {
      readonly kind: "raceSettled";
      readonly report: RaceReport | null;
      readonly result: RaceResult;
    }
  | { readonly kind: "raceOver" };

export type NavigationEvent =
  | RaceNews
  | { readonly kind: "barDecoded" }
  | { readonly kind: "careerBegun" }
  | { readonly kind: "raceRefused" }
  | {
      readonly kind: "picked";
      readonly screen: "garage" | "queue" | "routeBoard";
    }
  | {
      readonly kind: "entered";
      readonly room: RoomVisit | null;
      readonly rules: RulesLoad | null;
      readonly save: SaveState;
      readonly urlRide: boolean;
    }
  | { readonly kind: "left"; readonly save: SaveState }
  | { readonly kind: "roomMoved"; readonly visit: RoomVisit }
  | { readonly kind: "ridePicked"; readonly entry: RaceEntry }
  | { readonly kind: "raceBegun"; readonly plan: RacePlan };

type NavigationEffect =
  | { readonly kind: "beginCareer" }
  | {
      readonly kind: "decodeBar";
      readonly career: CareerState;
      readonly rules: RaceRules;
    };

type NavigationStep = Step<View, NavigationEffect>;

const backRoom: View = { screen: "backRoom" };
const elsewhere: View = { screen: "elsewhere" };
const clubhouse: View = { screen: "clubhouse" };
const gameOver: View = { screen: "gameOver" };
const ending: View = { screen: "ending" };
const routeBoard: View = { screen: "routeBoard" };

export const firstView = (): View => ({ screen: "boot" });

export const graphicsPlaceOf = {
  backRoom: "menu",
  boot: "menu",
  clubhouse: "menu",
  elsewhere: "menu",
  ending: "menu",
  gameOver: "menu",
  garage: "menu",
  queue: "menu",
  race: "race",
  results: "race",
  rideOut: "menu",
  room: "menu",
  routeBoard: "menu",
} as const satisfies Record<View["screen"], GraphicsPlace>;

export const stageOf = (view: View): "boot" | "race" | "menu" => {
  if (view.screen === "boot") {
    return "boot";
  }
  return view.screen === "race" ? "race" : "menu";
};

export const roomAddressOf = (view: View): RoomAddress | null => {
  switch (view.screen) {
    case "room": {
      return { arrival: view.visit.arrival, roomId: view.visit.roomId };
    }
    case "race": {
      return view.plan.room
        ? { arrival: null, roomId: view.plan.room.roomId }
        : null;
    }
    case "results": {
      return view.report.room
        ? { arrival: null, roomId: view.report.room.roomId }
        : null;
    }
    case "backRoom":
    case "boot":
    case "clubhouse":
    case "elsewhere":
    case "ending":
    case "gameOver":
    case "garage":
    case "queue":
    case "rideOut":
    case "routeBoard": {
      return null;
    }
    default: {
      return view satisfies never;
    }
  }
};

const homeOf = (career: CareerState): View => {
  if (career.gameOver) {
    return gameOver;
  }
  return career.story.ending === null ? clubhouse : ending;
};

const afterResults = ({ ledger }: RaceReport): View => {
  if (!ledger) {
    return routeBoard;
  }
  if (ledger.gameOver) {
    return gameOver;
  }
  if (ledger.ending !== null) {
    return ending;
  }
  return ledger.tierUp
    ? { promotion: ledger.tierUp, screen: "clubhouse" }
    : clubhouse;
};

const afterRace = (plan: RacePlan, report: RaceReport | null): View => {
  if (report) {
    return { report, screen: "results" };
  }
  return plan.mode === "career" ? clubhouse : routeBoard;
};

export const raceAgainOffered = (
  report: RaceReport,
  career: CareerState | null
): boolean =>
  report.ledger === null ||
  (career !== null &&
    afterResults(report) === clubhouse &&
    roadOpen(career, report.roadId));

const to = (state: View): NavigationStep => ({ effect: null, state });

const roomView = (from: View, visit: RoomVisit): View => ({
  screen: "room",
  turn: from.screen === "room" ? from.turn + 1 : 0,
  visit,
});

const raceAfter = (
  view: Extract<View, { readonly screen: "race" }>,
  event: RaceNews
): View => {
  switch (event.kind) {
    case "paused": {
      return { ...view, stage: { kind: "paused" } };
    }
    case "raceOver": {
      return view.stage.kind === "consequence"
        ? afterRace(view.plan, view.stage.report)
        : view;
    }
    case "raceSettled": {
      const { report, result } = event;
      return {
        ...view,
        stage:
          result === "finished" && report
            ? { kind: "finishing", report }
            : { kind: "consequence", report },
      };
    }
    case "resumed": {
      return { ...view, stage: { kind: "riding" } };
    }
    case "signalLost": {
      return { ...view, stage: { kind: "signalLost", lostAt: event.lostAt } };
    }
    default: {
      return event satisfies never;
    }
  }
};

const entering = (
  view: View,
  { room, rules, save, urlRide }: Extract<NavigationEvent, { kind: "entered" }>
): NavigationStep => {
  if (rules?.status === "failed") {
    return to(backRoom);
  }
  if (rules === null || urlRide || save.status === "loading") {
    return to(view);
  }
  if (room !== null) {
    return to(roomView(view, room));
  }
  switch (save.status) {
    case "corrupt":
    case "unread": {
      return to(backRoom);
    }
    case "elsewhere": {
      return to(elsewhere);
    }
    case "empty": {
      return { effect: { kind: "beginCareer" }, state: view };
    }
    case "ready": {
      const home = homeOf(save.career);
      return home.screen === "clubhouse"
        ? {
            effect: {
              career: save.career,
              kind: "decodeBar",
              rules: rules.rules,
            },
            state: view,
          }
        : to(home);
    }
    default: {
      return save satisfies never;
    }
  }
};

const homeFrom = (save: SaveState): NavigationStep => {
  switch (save.status) {
    case "corrupt":
    case "loading":
    case "unread": {
      return to(backRoom);
    }
    case "elsewhere": {
      return to(elsewhere);
    }
    case "empty": {
      return { effect: { kind: "beginCareer" }, state: clubhouse };
    }
    case "ready": {
      return to(homeOf(save.career));
    }
    default: {
      return save satisfies never;
    }
  }
};

const raceLeft = (
  view: Extract<View, { readonly screen: "race" }>,
  save: SaveState
): NavigationStep => {
  switch (view.stage.kind) {
    case "finishing": {
      return to({ report: view.stage.report, screen: "results" });
    }
    case "paused": {
      return view.plan.room ? homeFrom(save) : to(view);
    }
    case "consequence":
    case "riding":
    case "signalLost": {
      return to(view);
    }
    default: {
      return view.stage satisfies never;
    }
  }
};

const leaving = (view: View, save: SaveState): NavigationStep => {
  const career = save.status === "ready" ? save.career : null;
  switch (view.screen) {
    case "boot":
    case "elsewhere": {
      return to(view);
    }
    case "backRoom": {
      return to(career ? homeOf(career) : view);
    }
    case "clubhouse":
    case "ending":
    case "gameOver":
    case "routeBoard": {
      return to(backRoom);
    }
    case "garage":
    case "queue": {
      return to(clubhouse);
    }
    case "rideOut": {
      return to(view.entry.mode === "career" ? clubhouse : routeBoard);
    }
    case "room": {
      return homeFrom(save);
    }
    case "race": {
      return raceLeft(view, save);
    }
    case "results": {
      return view.report.room ? homeFrom(save) : to(afterResults(view.report));
    }
    default: {
      return view satisfies never;
    }
  }
};

export const stepNavigation = (
  view: View,
  event: NavigationEvent
): NavigationStep => {
  switch (event.kind) {
    case "barDecoded":
    case "careerBegun":
    case "raceRefused": {
      return to(clubhouse);
    }
    case "entered": {
      return view.screen === "boot" ? entering(view, event) : to(view);
    }
    case "left": {
      return leaving(view, event.save);
    }
    case "paused":
    case "raceOver":
    case "raceSettled":
    case "resumed":
    case "signalLost": {
      return to(view.screen === "race" ? raceAfter(view, event) : view);
    }
    case "picked": {
      return to({ screen: event.screen });
    }
    case "raceBegun": {
      return to({
        plan: event.plan,
        screen: "race",
        stage: { kind: "riding" },
      });
    }
    case "ridePicked": {
      return to(
        view.screen === "results" && view.report.room
          ? roomView(view, {
              arrival: "rematch",
              rejoin: null,
              roomId: view.report.room.roomId,
            })
          : { entry: event.entry, screen: "rideOut" }
      );
    }
    case "roomMoved": {
      return to(view.screen === "boot" ? view : roomView(view, event.visit));
    }
    default: {
      return event satisfies never;
    }
  }
};
