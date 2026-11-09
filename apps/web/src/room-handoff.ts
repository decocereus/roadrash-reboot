import type { Refusal } from "@racer/rooms/messages";
import type { SeatPhase } from "@racer/rooms/seat-client";

import type { PreparedRace } from "./prepare-outcome.ts";
import { move } from "./race-handoff.ts";
import type { Carrying, Rows, Step } from "./race-handoff.ts";

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

const seatClosings = ["keep", "leave", "leaveRoom"] as const;

type SeatClosing = (typeof seatClosings)[number];

export const seatClosing = <Ride>(
  handoff: RoomHandoff<Ride>,
  bootFailed: boolean
): SeatClosing => {
  if (bootFailed) {
    return "leaveRoom";
  }
  return handoff.kind === "riding" ? "keep" : "leave";
};

const seatChanges = [
  "backToLobby",
  "raceLost",
  "redraw",
  "reopen",
  "seatFlooded",
  "seatTaken",
  "tryRejoin",
] as const;

type SeatChange = (typeof seatChanges)[number];

export const seatChange = <Ride>(
  phase: SeatPhase,
  refusal: Refusal | null,
  inRace: boolean,
  handoff: RoomHandoff<Ride>
): SeatChange => {
  switch (phase) {
    case "ended": {
      return handoff.kind === "riding" ? "redraw" : "backToLobby";
    }
    case "lost": {
      if (refusal === "replaced") {
        return "seatTaken";
      }
      if (refusal === "flooded") {
        return "seatFlooded";
      }
      if (!inRace) {
        return "reopen";
      }
      return handoff.kind === "riding" ? "raceLost" : "tryRejoin";
    }
    case "connecting":
    case "left":
    case "loading":
    case "lobby":
    case "racing":
    case "refused": {
      return "redraw";
    }
    default: {
      return phase satisfies never;
    }
  }
};
