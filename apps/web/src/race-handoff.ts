import type { PreparedRace } from "./prepare-outcome.ts";

export interface Step<State, Effect> {
  readonly effect: Effect | null;
  readonly state: State;
}

interface Carrying<Kind, Ride> {
  readonly kind: Kind;
  readonly ride: Ride;
}

type Rows<
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

const move = <
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

const rideOutKinds = [
  "closed",
  "dwelling",
  "failed",
  "failedDwelt",
  "preparing",
  "preparingDwelt",
  "started",
  "waitingForGame",
  "waitingForGameDwelt",
] as const;

const rideOutEffectKinds = ["prepare", "start"] as const;

export const rideOutSignals = [
  "closed",
  "dwellElapsed",
  "gameReady",
  "retry",
] as const;

type RideOutKind = (typeof rideOutKinds)[number];
type RideOutEventKind = (typeof rideOutSignals)[number] | PreparedRace;
type RideOutEffectKind = (typeof rideOutEffectKinds)[number];

export type RideOutHandoff<Ride> = Carrying<RideOutKind, Ride>;
type RideOutEffect<Ride> = Carrying<RideOutEffectKind, Ride>;
export interface RideOutEvent {
  readonly kind: RideOutEventKind;
}

const rideOutRows = {
  closed: {},
  dwelling: { dwellElapsed: ["started", "start"] },
  failed: { dwellElapsed: ["failedDwelt"], retry: ["preparing", "prepare"] },
  failedDwelt: { retry: ["preparingDwelt", "prepare"] },
  preparing: {
    built: ["dwelling"],
    dwellElapsed: ["preparingDwelt"],
    missing: ["failed"],
  },
  preparingDwelt: { built: ["started", "start"], missing: ["failedDwelt"] },
  started: {},
  waitingForGame: {
    dwellElapsed: ["waitingForGameDwelt"],
    gameReady: ["preparing", "prepare"],
  },
  waitingForGameDwelt: { gameReady: ["preparingDwelt", "prepare"] },
} as const satisfies Rows<
  RideOutKind,
  Exclude<RideOutEventKind, "closed">,
  RideOutEffectKind
>;

export const stepRideOut = <Ride>(
  state: RideOutHandoff<Ride>,
  event: RideOutEvent
): Step<RideOutHandoff<Ride>, RideOutEffect<Ride>> =>
  event.kind === "closed"
    ? { effect: null, state: { kind: "closed", ride: state.ride } }
    : move(rideOutRows, state, event.kind);

const roomKinds = [
  "atDoor",
  "left",
  "preparing",
  "preparingPastDoor",
  "riding",
  "waitingForRoom",
] as const;

const roomEffectKinds = ["leave", "prepare", "reportLoaded", "start"] as const;

export const roomSignals = ["doorElapsed", "roomRacing"] as const;

type RoomKind = (typeof roomKinds)[number];
type RoomEventKind = (typeof roomSignals)[number] | PreparedRace;
type RoomEffectKind = (typeof roomEffectKinds)[number];

export type RoomHandoff<Ride> =
  | { readonly kind: "lobby" }
  | Carrying<RoomKind, Ride>;
type RoomEffect<Ride> = Carrying<RoomEffectKind, Ride>;
export type RoomEvent<Ride> =
  | { readonly kind: "raceBegun"; readonly ride: Ride }
  | { readonly kind: RoomEventKind };

const roomRows = {
  atDoor: { doorElapsed: ["waitingForRoom", "reportLoaded"] },
  left: {},
  preparing: {
    built: ["atDoor"],
    doorElapsed: ["preparingPastDoor"],
    missing: ["left", "leave"],
  },
  preparingPastDoor: {
    built: ["waitingForRoom", "reportLoaded"],
    missing: ["left", "leave"],
  },
  riding: {},
  waitingForRoom: { roomRacing: ["riding", "start"] },
} as const satisfies Rows<RoomKind, RoomEventKind, RoomEffectKind>;

export const stepRoom = <Ride>(
  state: RoomHandoff<Ride>,
  event: RoomEvent<Ride>
): Step<RoomHandoff<Ride>, RoomEffect<Ride>> => {
  if (event.kind === "raceBegun") {
    return state.kind === "lobby"
      ? {
          effect: { kind: "prepare", ride: event.ride },
          state: { kind: "preparing", ride: event.ride },
        }
      : { effect: null, state };
  }
  return state.kind === "lobby"
    ? { effect: null, state }
    : move(roomRows, state, event.kind);
};
