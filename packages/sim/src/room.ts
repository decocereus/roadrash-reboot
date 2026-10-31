import { coasting, withoutButtons } from "./control.ts";
import { createRace, stepRace } from "./race.ts";
import {
  clearFrame,
  createScratch,
  createTickFrame,
  scratchFor,
} from "./room-frame.ts";
import type { TickFrame } from "./room-frame.ts";
import { HASH_WORDS } from "./snapshot-bytes.ts";
import { setupDigest } from "./snapshot-setup.ts";
import { hashRace } from "./snapshot.ts";
import { rosterOf } from "./state.ts";
import type {
  Control,
  Controller,
  RaceSetup,
  RaceState,
  RiderId,
  RiderState,
} from "./state.ts";

const MOST_SEATS = 8;
export const HOLD_TICKS = 6;
export const AUTO_AFTER_TICKS = 30;
export const INPUT_HORIZON = 32;
export const HASH_EVERY = 60;

const NO_TICK = -1;

export const roomSetup = (
  setup: RaceSetup,
  humans: readonly RiderId[]
): RaceSetup => {
  const roster = rosterOf(setup);
  const racers = new Set([roster.player, ...roster.rivals]);
  const seated = new Set(humans);
  if (
    humans.length === 0 ||
    humans.length > MOST_SEATS ||
    seated.size !== humans.length ||
    humans.some((rider) => !racers.has(rider))
  ) {
    throw new RangeError(
      `A room seats 1 to ${MOST_SEATS} different racers, not riders ${humans.join(", ")}.`
    );
  }
  const controllerOf = (rider: RiderId | undefined): Controller =>
    rider !== undefined && seated.has(rider) ? "human" : "pilot";
  return {
    ...setup,
    pacing: { catchUp: 0, leadEase: 0 },
    player: { ...setup.player, controller: controllerOf(roster.player) },
    rivals: setup.rivals.map((rival, at) => ({
      ...rival,
      controller: controllerOf(roster.rivals[at]),
    })),
  };
};

export const seatsOf = (state: RaceState): readonly RiderState[] =>
  state.riders.filter((rider) => rider.controller === "human");

interface Acceptance {
  accepted: number;
  late: number;
  ahead: number;
}

interface Seat {
  readonly rider: RiderState;
  readonly ticks: number[];
  readonly controls: Control[];
  last: Control;
  silent: number;
  left: boolean;
}

const seatFor = (rider: RiderState): Seat => ({
  controls: Array.from({ length: INPUT_HORIZON }, () => coasting),
  last: coasting,
  left: false,
  rider,
  silent: 0,
  ticks: Array.from({ length: INPUT_HORIZON }, () => NO_TICK),
});

export interface Room {
  readonly state: RaceState;
  readonly frame: TickFrame;
  readonly hash: Uint32Array;
  readonly acceptance: Acceptance;
  hashed: boolean;
  readonly accept: (
    rider: RiderId,
    firstTick: number,
    controls: readonly Control[]
  ) => Acceptance;
  readonly leave: (rider: RiderId) => void;
  readonly step: () => void;
}

const seatFrame = (seat: Seat, tick: number, frame: TickFrame): void => {
  const { rider } = seat;
  const slot = tick % INPUT_HORIZON;
  if (seat.left) {
    if (rider.controller === "human") {
      frame.handovers.set(rider.id, "pilot");
    }
    return;
  }
  if (seat.ticks[slot] === tick) {
    const control = seat.controls[slot] ?? coasting;
    seat.last = control;
    seat.silent = 0;
    if (rider.controller === "pilot") {
      frame.handovers.set(rider.id, "human");
    }
    frame.controls.set(rider.id, control);
    return;
  }
  seat.silent += 1;
  if (rider.controller === "pilot") {
    return;
  }
  if (seat.silent > AUTO_AFTER_TICKS) {
    frame.handovers.set(rider.id, "pilot");
    return;
  }
  frame.controls.set(
    rider.id,
    seat.silent <= HOLD_TICKS ? withoutButtons(seat.last) : coasting
  );
};

export const createRoom = (setup: RaceSetup): Room => {
  const state = createRace(setup);
  const digest = setupDigest(state, setup.track);
  const scratch = createScratch(state);
  const seats = seatsOf(state).map(seatFor);
  const seatOf = (rider: RiderId): Seat | undefined =>
    seats.find((seat) => seat.rider.id === rider);
  const room: Room = {
    accept: (rider, firstTick, controls) => {
      const seat = seatOf(rider);
      const tally = room.acceptance;
      tally.accepted = 0;
      tally.late = 0;
      tally.ahead = 0;
      for (let index = 0; index < controls.length; index += 1) {
        const tick = firstTick + index;
        const slot = tick % INPUT_HORIZON;
        const control = controls[index];
        if (seat === undefined || seat.left || seat.ticks[slot] === tick) {
          continue;
        }
        if (tick <= state.tick) {
          tally.late += 1;
        } else if (tick > state.tick + INPUT_HORIZON) {
          tally.ahead += 1;
        } else if (control !== undefined) {
          seat.ticks[slot] = tick;
          seat.controls[slot] = control;
          tally.accepted += 1;
        }
      }
      return tally;
    },
    acceptance: { accepted: 0, ahead: 0, late: 0 },
    frame: createTickFrame(),
    hash: new Uint32Array(HASH_WORDS),
    hashed: false,
    leave: (rider) => {
      const seat = seatOf(rider);
      if (seat) {
        seat.left = true;
      }
    },
    state,
    step: () => {
      const tick = state.tick + 1;
      clearFrame(room.frame, tick);
      for (const seat of seats) {
        seatFrame(seat, tick, room.frame);
      }
      stepRace(state, setup.track, room.frame);
      room.hashed = tick % HASH_EVERY === 0;
      if (room.hashed) {
        hashRace(state, digest, scratchFor(scratch, state), room.hash);
      }
    },
  };
  return room;
};
