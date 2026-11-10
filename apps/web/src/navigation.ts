import { roadOpen } from "@racer/career/field";
import type { RaceResult } from "@racer/career/outcome";
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

export const barTabs = ["race", "garage", "settings"] as const;

export type BarTab = (typeof barTabs)[number];

export type BarPanel =
  | { readonly kind: "home" }
  | { readonly kind: "solo" }
  | { readonly kind: "finding" }
  | { readonly kind: "invite"; readonly roomId: string }
  | {
      readonly kind: "lobby";
      readonly visit: RoomVisit;
      readonly turn: number;
    };

export type RaceStage =
  | { readonly kind: "riding" }
  | { readonly kind: "paused" }
  | { readonly kind: "signalLost"; readonly lostAt: number }
  | { readonly kind: "finishing"; readonly report: RaceReport }
  | { readonly kind: "consequence"; readonly report: RaceReport | null };

export type View =
  | { readonly screen: "boot" }
  | { readonly screen: "elsewhere" }
  | {
      readonly screen: "bar";
      readonly tab: BarTab;
      readonly panel: BarPanel;
    }
  | { readonly screen: "rideOut"; readonly entry: RaceEntry }
  | {
      readonly screen: "race";
      readonly plan: RacePlan;
      readonly stage: RaceStage;
    }
  | { readonly screen: "results"; readonly report: RaceReport }
  | { readonly screen: "ending" }
  | { readonly screen: "gameOver" };

export type BarView = Extract<View, { readonly screen: "bar" }>;

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
  | { readonly kind: "careerBegun" }
  | { readonly kind: "raceRefused" }
  | { readonly kind: "tabbed"; readonly tab: BarTab }
  | { readonly kind: "picked"; readonly panel: "solo" | "finding" }
  | { readonly kind: "joined" }
  | { readonly kind: "doorOpened" }
  | {
      readonly kind: "entered";
      readonly room: RoomVisit | null;
      readonly invited: boolean;
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
  | { readonly kind: "rememberRoom"; readonly roomId: string };

type NavigationStep = Step<View, NavigationEffect>;

const elsewhere: View = { screen: "elsewhere" };
const gameOver: View = { screen: "gameOver" };
const ending: View = { screen: "ending" };

const barAt = (panel: BarPanel): BarView => ({
  panel,
  screen: "bar",
  tab: "race",
});

const home = barAt({ kind: "home" });

export const firstView = (): View => ({ screen: "boot" });

export const graphicsPlaceOf = {
  bar: "bar",
  boot: "menu",
  elsewhere: "menu",
  ending: "menu",
  gameOver: "menu",
  race: "race",
  results: "race",
  rideOut: "menu",
} as const satisfies Record<View["screen"], GraphicsPlace>;

export const stageOf = (view: View): "boot" | "race" | "menu" => {
  if (view.screen === "boot") {
    return "boot";
  }
  return view.screen === "race" ? "race" : "menu";
};

const panelAddressOf = (panel: BarPanel): RoomAddress | null => {
  switch (panel.kind) {
    case "lobby": {
      return { arrival: panel.visit.arrival, roomId: panel.visit.roomId };
    }
    case "invite": {
      return { arrival: "link", roomId: panel.roomId };
    }
    case "finding":
    case "home":
    case "solo": {
      return null;
    }
    default: {
      return panel satisfies never;
    }
  }
};

export const roomAddressOf = (view: View): RoomAddress | null => {
  switch (view.screen) {
    case "bar": {
      return panelAddressOf(view.panel);
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
    case "boot":
    case "elsewhere":
    case "ending":
    case "gameOver":
    case "rideOut": {
      return null;
    }
    default: {
      return view satisfies never;
    }
  }
};

const afterResults = ({ ledger }: RaceReport): View => {
  if (ledger === null) {
    return home;
  }
  if (ledger.gameOver) {
    return gameOver;
  }
  return ledger.ending === null ? home : ending;
};

const afterRace = (report: RaceReport | null): View =>
  report ? { report, screen: "results" } : home;

export const raceAgainOffered = (
  report: RaceReport,
  career: CareerState | null
): boolean =>
  report.ledger === null ||
  (career !== null &&
    report.ledger.tierUp === null &&
    afterResults(report) === home &&
    roadOpen(career, report.roadId));

const to = (state: View): NavigationStep => ({ effect: null, state });

const beginCareer: NavigationEffect = { kind: "beginCareer" };

const careerFor = (state: View, save: SaveState): NavigationStep =>
  state.screen === "bar" &&
  panelAddressOf(state.panel) === null &&
  save.status === "empty"
    ? { effect: beginCareer, state }
    : to(state);

const lobbyAt = (from: View, visit: RoomVisit): BarView => {
  const lobby: BarPanel = {
    kind: "lobby",
    turn:
      from.screen === "bar" && from.panel.kind === "lobby"
        ? from.panel.turn + 1
        : 0,
    visit,
  };
  return from.screen === "bar"
    ? { ...from, panel: lobby }
    : { panel: lobby, screen: "bar", tab: "race" };
};

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
        ? afterRace(view.stage.report)
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

const enteringFrom = (
  view: View,
  {
    invited,
    room,
    rules,
    save,
    urlRide,
  }: Extract<NavigationEvent, { kind: "entered" }>
): NavigationStep => {
  if (rules?.status === "failed") {
    return to(home);
  }
  if (rules === null || urlRide || save.status === "loading") {
    return to(view);
  }
  if (room !== null) {
    return to(
      invited
        ? barAt({ kind: "invite", roomId: room.roomId })
        : lobbyAt(view, room)
    );
  }
  switch (save.status) {
    case "corrupt":
    case "ready":
    case "unread": {
      return to(home);
    }
    case "elsewhere": {
      return to(elsewhere);
    }
    case "empty": {
      return { effect: beginCareer, state: view };
    }
    default: {
      return save satisfies never;
    }
  }
};

const entering = (
  view: View,
  event: Extract<NavigationEvent, { kind: "entered" }>
): NavigationStep =>
  view.screen === "boot"
    ? enteringFrom(view, event)
    : careerFor(view, event.save);

const homeFrom = (save: SaveState): NavigationStep => {
  switch (save.status) {
    case "corrupt":
    case "loading":
    case "ready":
    case "unread": {
      return to(home);
    }
    case "elsewhere": {
      return to(elsewhere);
    }
    case "empty": {
      return careerFor(home, save);
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

const barLeft = (view: BarView, save: SaveState): NavigationStep => {
  if (view.tab !== "race") {
    return to({ ...view, tab: "race" });
  }
  switch (view.panel.kind) {
    case "home": {
      return careerFor(view, save);
    }
    case "finding":
    case "invite":
    case "lobby":
    case "solo": {
      return homeFrom(save);
    }
    default: {
      return view.panel satisfies never;
    }
  }
};

const leaving = (view: View, save: SaveState): NavigationStep => {
  switch (view.screen) {
    case "boot":
    case "elsewhere": {
      return to(view);
    }
    case "bar": {
      return barLeft(view, save);
    }
    case "ending":
    case "gameOver": {
      return to(home);
    }
    case "rideOut": {
      return to(barAt({ kind: "solo" }));
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

const inBar = (view: View, change: (bar: BarView) => View): View =>
  view.screen === "bar" ? change(view) : view;

const joining = (view: View): NavigationStep =>
  view.screen === "bar" && view.panel.kind === "invite"
    ? {
        effect: { kind: "rememberRoom", roomId: view.panel.roomId },
        state: lobbyAt(view, {
          arrival: "link",
          rejoin: null,
          roomId: view.panel.roomId,
        }),
      }
    : to(view);

const picking = (bar: BarView, panel: "solo" | "finding"): View =>
  bar.panel.kind === "home" || bar.panel.kind === "solo"
    ? barAt({ kind: panel })
    : bar;

const rematchOrRide = (view: View, entry: RaceEntry): View =>
  view.screen === "results" && view.report.room
    ? lobbyAt(view, {
        arrival: "rematch",
        rejoin: null,
        roomId: view.report.room.roomId,
      })
    : { entry, screen: "rideOut" };

export const stepNavigation = (
  view: View,
  event: NavigationEvent
): NavigationStep => {
  switch (event.kind) {
    case "careerBegun": {
      return to(view.screen === "bar" ? view : home);
    }
    case "raceRefused": {
      return to(home);
    }
    case "doorOpened": {
      return to(inBar(view, (bar) => ({ ...bar, tab: "race" })));
    }
    case "entered": {
      return entering(view, event);
    }
    case "joined": {
      return joining(view);
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
      return to(inBar(view, (bar) => picking(bar, event.panel)));
    }
    case "raceBegun": {
      return to({
        plan: event.plan,
        screen: "race",
        stage: { kind: "riding" },
      });
    }
    case "ridePicked": {
      return to(rematchOrRide(view, event.entry));
    }
    case "roomMoved": {
      return to(view.screen === "boot" ? view : lobbyAt(view, event.visit));
    }
    case "tabbed": {
      return to(inBar(view, (bar) => ({ ...bar, tab: event.tab })));
    }
    default: {
      return event satisfies never;
    }
  }
};
