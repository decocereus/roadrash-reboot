import { roadOpen } from "@racer/career/field";
import type { RaceResult } from "@racer/career/outcome";
import type { CareerState } from "@racer/career/state";
import type { GraphicsPlace, RoomArrival } from "@racer/telemetry/limits";

import type { BarSpot } from "./bar-view.ts";
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

const spotTabs = {
  garage: "garage",
} as const satisfies Record<BarSpot, BarTab>;

type Landing =
  | { readonly kind: "home" }
  | { readonly kind: "invite"; readonly roomId: string }
  | {
      readonly kind: "lobby";
      readonly visit: RoomVisit;
      readonly turn: number;
    };

export type BarPanel =
  | Landing
  | { readonly kind: "welcome"; readonly next: Landing }
  | { readonly kind: "solo" }
  | { readonly kind: "finding" }
  | { readonly kind: "door"; readonly entry: RaceEntry }
  | { readonly kind: "results"; readonly report: RaceReport }
  | { readonly kind: "over" };

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
  | {
      readonly screen: "race";
      readonly plan: RacePlan;
      readonly stage: RaceStage;
    };

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
  | { readonly kind: "raceOver" }
  | { readonly kind: "movedOn" };

export type NavigationEvent =
  | RaceNews
  | { readonly kind: "careerBegun" }
  | { readonly kind: "welcomed" }
  | { readonly kind: "raceRefused" }
  | { readonly kind: "tabbed"; readonly tab: BarTab }
  | { readonly kind: "walkedUp"; readonly spot: BarSpot }
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
      readonly welcomed: boolean;
    }
  | { readonly kind: "left"; readonly save: SaveState }
  | { readonly kind: "roomMoved"; readonly visit: RoomVisit }
  | { readonly kind: "nextRace" }
  | { readonly kind: "ridePicked"; readonly entry: RaceEntry }
  | { readonly kind: "raceBegun"; readonly plan: RacePlan };

type NavigationEffect =
  | { readonly kind: "beginCareer" }
  | { readonly kind: "rememberRoom"; readonly roomId: string };

type NavigationStep = Step<View, NavigationEffect>;

const elsewhere: View = { screen: "elsewhere" };

const barAt = (panel: BarPanel): BarView => ({
  panel,
  screen: "bar",
  tab: "race",
});

const homePanel: Landing = { kind: "home" };
const home = barAt(homePanel);
const over = barAt({ kind: "over" });

export const firstView = (): View => ({ screen: "boot" });

export const graphicsPlaceOf = {
  bar: "bar",
  boot: "menu",
  elsewhere: "menu",
  race: "race",
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
    case "results": {
      return panel.report.room
        ? { arrival: null, roomId: panel.report.room.roomId }
        : null;
    }
    case "welcome": {
      return panelAddressOf(panel.next);
    }
    case "door":
    case "finding":
    case "home":
    case "over":
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
    case "boot":
    case "elsewhere": {
      return null;
    }
    default: {
      return view satisfies never;
    }
  }
};

const afterResults = ({ ledger }: RaceReport): BarView =>
  ledger !== null && (ledger.gameOver || ledger.ending !== null) ? over : home;

const afterRace = (report: RaceReport | null): View =>
  report ? barAt({ kind: "results", report }) : home;

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
    case "movedOn": {
      return view.stage.kind === "finishing"
        ? afterRace(view.stage.report)
        : view;
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

const landingAt = (next: Landing, welcomed: boolean): BarView =>
  barAt(welcomed ? next : { kind: "welcome", next });

const enteringFrom = (
  view: View,
  {
    invited,
    room,
    rules,
    save,
    urlRide,
    welcomed,
  }: Extract<NavigationEvent, { kind: "entered" }>
): NavigationStep => {
  if (rules?.status === "failed") {
    return to(landingAt(homePanel, welcomed));
  }
  if (rules === null || urlRide || save.status === "loading") {
    return to(view);
  }
  if (room !== null) {
    return to(
      landingAt(
        invited
          ? { kind: "invite", roomId: room.roomId }
          : { kind: "lobby", turn: 0, visit: room },
        welcomed
      )
    );
  }
  switch (save.status) {
    case "corrupt":
    case "ready":
    case "unread": {
      return to(landingAt(homePanel, welcomed));
    }
    case "elsewhere": {
      return to(elsewhere);
    }
    case "empty": {
      return {
        effect: beginCareer,
        state: welcomed ? view : landingAt(homePanel, welcomed),
      };
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
    case "paused": {
      return view.plan.room ? homeFrom(save) : to(view);
    }
    case "consequence":
    case "finishing":
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
    case "door": {
      return to(barAt({ kind: "solo" }));
    }
    case "welcome": {
      return to(view);
    }
    case "results": {
      return view.panel.report.room
        ? homeFrom(save)
        : to(afterResults(view.panel.report));
    }
    case "finding":
    case "invite":
    case "lobby":
    case "over":
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
    case "race": {
      return raceLeft(view, save);
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

const ridesFrom = (panel: BarPanel): boolean => {
  switch (panel.kind) {
    case "solo": {
      return true;
    }
    case "results": {
      return panel.report.room === undefined;
    }
    case "door":
    case "finding":
    case "home":
    case "invite":
    case "lobby":
    case "over":
    case "welcome": {
      return false;
    }
    default: {
      return panel satisfies never;
    }
  }
};

const riding = (bar: BarView, entry: RaceEntry): View =>
  ridesFrom(bar.panel) ? barAt({ entry, kind: "door" }) : bar;

const nextRace = (bar: BarView): View =>
  bar.panel.kind === "results" && bar.panel.report.room
    ? lobbyAt(bar, {
        arrival: "rematch",
        rejoin: null,
        roomId: bar.panel.report.room.roomId,
      })
    : bar;

const showsCareerResults = (panel: BarPanel): boolean =>
  panel.kind === "results" &&
  panel.report.mode === "career" &&
  panel.report.room === undefined;

const careerBegun = (view: View): View => {
  if (view.screen !== "bar" || view.panel.kind === "over") {
    return home;
  }
  return showsCareerResults(view.panel) ? { ...view, panel: home.panel } : view;
};

const inRace = (view: View, event: RaceNews): View =>
  view.screen === "race" ? raceAfter(view, event) : view;

const movedToRoom = (view: View, visit: RoomVisit): View =>
  view.screen === "boot" ? view : lobbyAt(view, visit);

type BarNews = Extract<
  NavigationEvent,
  {
    readonly kind:
      | "doorOpened"
      | "nextRace"
      | "picked"
      | "ridePicked"
      | "tabbed"
      | "walkedUp"
      | "welcomed";
  }
>;

const barAfter = (bar: BarView, event: BarNews): View => {
  switch (event.kind) {
    case "doorOpened": {
      return { ...bar, tab: "race" };
    }
    case "nextRace": {
      return nextRace(bar);
    }
    case "picked": {
      return picking(bar, event.panel);
    }
    case "ridePicked": {
      return riding(bar, event.entry);
    }
    case "tabbed": {
      return bar.panel.kind === "welcome" ? bar : { ...bar, tab: event.tab };
    }
    case "walkedUp": {
      return bar.panel.kind === "welcome"
        ? bar
        : { ...bar, tab: spotTabs[event.spot] };
    }
    case "welcomed": {
      return bar.panel.kind === "welcome" ? barAt(bar.panel.next) : bar;
    }
    default: {
      return event satisfies never;
    }
  }
};

const raceNewsKinds = {
  movedOn: true,
  paused: true,
  raceOver: true,
  raceSettled: true,
  resumed: true,
  signalLost: true,
} as const satisfies Record<RaceNews["kind"], true>;

const isRaceNews = (event: NavigationEvent): event is RaceNews =>
  Object.hasOwn(raceNewsKinds, event.kind);

const stepOutsideRace = (
  view: View,
  event: Exclude<NavigationEvent, RaceNews>
): NavigationStep => {
  switch (event.kind) {
    case "careerBegun": {
      return to(careerBegun(view));
    }
    case "raceRefused": {
      return to(home);
    }
    case "doorOpened":
    case "nextRace":
    case "picked":
    case "ridePicked":
    case "tabbed":
    case "walkedUp":
    case "welcomed": {
      return to(inBar(view, (bar) => barAfter(bar, event)));
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
    case "raceBegun": {
      return to({
        plan: event.plan,
        screen: "race",
        stage: { kind: "riding" },
      });
    }
    case "roomMoved": {
      return to(movedToRoom(view, event.visit));
    }
    default: {
      return event satisfies never;
    }
  }
};

export const stepNavigation = (
  view: View,
  event: NavigationEvent
): NavigationStep =>
  isRaceNews(event) ? to(inRace(view, event)) : stepOutsideRace(view, event);
