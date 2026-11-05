import { roadOpen } from "@racer/career/field";
import type { RaceResult } from "@racer/career/outcome";
import type { RaceRules } from "@racer/career/rules";
import type { TierUp } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";

import type { RaceEntry, RaceReport } from "./career/flow.ts";
import type { SaveState } from "./career/save.ts";
import type { RacePlan } from "./game/hud.ts";
import type { Step } from "./race-handoff.ts";
import type { RulesLoad } from "./rules/load.ts";

type RaceStage =
  | { readonly kind: "riding" }
  | { readonly kind: "paused" }
  | { readonly kind: "finishing"; readonly report: RaceReport }
  | { readonly kind: "consequence"; readonly report: RaceReport | null };

export type View =
  | { readonly screen: "boot" }
  | { readonly screen: "clubhouse"; readonly promotion?: TierUp }
  | { readonly screen: "backRoom" }
  | { readonly screen: "routeBoard" }
  | { readonly screen: "garage" }
  | { readonly screen: "rideOut"; readonly entry: RaceEntry }
  | { readonly screen: "queue" }
  | { readonly screen: "room"; readonly roomId: string }
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
      readonly roomId: string | null;
      readonly rules: RulesLoad | null;
      readonly save: SaveState;
      readonly urlRide: boolean;
    }
  | { readonly kind: "left"; readonly career: CareerState | null }
  | { readonly kind: "ridePicked"; readonly entry: RaceEntry }
  | { readonly kind: "raceBegun"; readonly plan: RacePlan };

type NavigationEffect =
  | { readonly kind: "beginCareer" }
  | {
      readonly kind: "decodeBar";
      readonly career: CareerState;
      readonly rules: RaceRules;
    }
  | { readonly kind: "openBar" }
  | { readonly kind: "rematch"; readonly roomId: string };

type NavigationStep = Step<View, NavigationEffect>;

const backRoom: View = { screen: "backRoom" };
const clubhouse: View = { screen: "clubhouse" };
const gameOver: View = { screen: "gameOver" };
const ending: View = { screen: "ending" };
const routeBoard: View = { screen: "routeBoard" };

export const firstView = (): View => ({ screen: "boot" });

export const stageOf = (view: View): "boot" | "race" | "menu" => {
  if (view.screen === "boot") {
    return "boot";
  }
  return view.screen === "race" ? "race" : "menu";
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
    default: {
      return event satisfies never;
    }
  }
};

const entering = (
  view: View,
  {
    roomId,
    rules,
    save,
    urlRide,
  }: Extract<NavigationEvent, { kind: "entered" }>
): NavigationStep => {
  if (rules?.status === "failed") {
    return to(backRoom);
  }
  if (rules === null || urlRide || save.status === "loading") {
    return to(view);
  }
  if (roomId !== null) {
    return to({ roomId, screen: "room" });
  }
  switch (save.status) {
    case "corrupt":
    case "unread": {
      return to(backRoom);
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

const openingBar = (view: View): NavigationStep => ({
  effect: { kind: "openBar" },
  state: view,
});

const leaving = (view: View, career: CareerState | null): NavigationStep => {
  switch (view.screen) {
    case "boot": {
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
      return openingBar(view);
    }
    case "race": {
      return to(
        view.stage.kind === "finishing"
          ? { report: view.stage.report, screen: "results" }
          : view
      );
    }
    case "results": {
      return view.report.room
        ? openingBar(view)
        : to(afterResults(view.report));
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
      return leaving(view, event.career);
    }
    case "paused":
    case "raceOver":
    case "raceSettled":
    case "resumed": {
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
      return view.screen === "results" && view.report.room
        ? {
            effect: { kind: "rematch", roomId: view.report.room.roomId },
            state: view,
          }
        : to({ entry: event.entry, screen: "rideOut" });
    }
    default: {
      return event satisfies never;
    }
  }
};
