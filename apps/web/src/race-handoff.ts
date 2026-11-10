import type { PreparedRace } from "./prepare-outcome.ts";

export interface Step<State, Effect> {
  readonly effect: Effect | null;
  readonly state: State;
}

export interface Carrying<Kind, Ride> {
  readonly kind: Kind;
  readonly ride: Ride;
}

export type Rows<
  Kind extends string,
  EventKind extends string,
  EffectKind extends string,
> = Readonly<
  Record<
    Kind,
    Readonly<
      Partial<Record<EventKind, readonly [next: Kind, effect?: EffectKind]>>
    >
  >
>;

export const move = <
  Kind extends string,
  EventKind extends string,
  EffectKind extends string,
  Ride,
>(
  rows: Rows<Kind, EventKind, EffectKind>,
  state: Carrying<Kind, Ride>,
  event: EventKind
): Step<Carrying<Kind, Ride>, Carrying<EffectKind, Ride>> => {
  const cell = rows[state.kind][event];
  if (!cell) {
    return { effect: null, state };
  }
  const [kind, effect] = cell;
  const { ride } = state;
  return {
    effect: effect === undefined ? null : { kind: effect, ride },
    state: { kind, ride },
  };
};

const soloDoorKinds = [
  "atDoor",
  "closed",
  "failed",
  "failedPastDoor",
  "preparing",
  "preparingPastDoor",
  "started",
  "waitingForGame",
  "waitingForGamePastDoor",
] as const;

const soloDoorEffectKinds = ["prepare", "start"] as const;

export const soloDoorSignals = [
  "closed",
  "doorElapsed",
  "gameReady",
  "retry",
] as const;

type SoloDoorKind = (typeof soloDoorKinds)[number];
type SoloDoorEventKind = (typeof soloDoorSignals)[number] | PreparedRace;
type SoloDoorEffectKind = (typeof soloDoorEffectKinds)[number];

export type SoloDoorHandoff<Ride> = Carrying<SoloDoorKind, Ride>;
type SoloDoorEffect<Ride> = Carrying<SoloDoorEffectKind, Ride>;
export interface SoloDoorEvent {
  readonly kind: SoloDoorEventKind;
}

const soloDoorRows = {
  atDoor: { doorElapsed: ["started", "start"] },
  closed: {},
  failed: {
    doorElapsed: ["failedPastDoor"],
    retry: ["preparing", "prepare"],
  },
  failedPastDoor: { retry: ["preparingPastDoor", "prepare"] },
  preparing: {
    built: ["atDoor"],
    doorElapsed: ["preparingPastDoor"],
    missing: ["failed"],
  },
  preparingPastDoor: {
    built: ["started", "start"],
    missing: ["failedPastDoor"],
  },
  started: {},
  waitingForGame: {
    doorElapsed: ["waitingForGamePastDoor"],
    gameReady: ["preparing", "prepare"],
  },
  waitingForGamePastDoor: { gameReady: ["preparingPastDoor", "prepare"] },
} as const satisfies Rows<
  SoloDoorKind,
  Exclude<SoloDoorEventKind, "closed">,
  SoloDoorEffectKind
>;

export const stepSoloDoor = <Ride>(
  state: SoloDoorHandoff<Ride>,
  event: SoloDoorEvent
): Step<SoloDoorHandoff<Ride>, SoloDoorEffect<Ride>> =>
  event.kind === "closed"
    ? { effect: null, state: { kind: "closed", ride: state.ride } }
    : move(soloDoorRows, state, event.kind);
