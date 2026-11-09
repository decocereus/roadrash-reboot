import {
  coasting,
  CONTROL_BYTES,
  readControl,
  withoutButtons,
  writeControl,
} from "./control.ts";
import { createRace, stepRace } from "./race.ts";
import {
  clearFrame,
  createScratch,
  createTickFrame,
  scratchFor,
} from "./room-frame.ts";
import type { TickFrame } from "./room-frame.ts";
import { HASH_WORDS, refuse } from "./snapshot-bytes.ts";
import { setupDigest } from "./snapshot-setup.ts";
import { hashRace } from "./snapshot.ts";
import { riderIdAt, rosterOf } from "./state.ts";
import type {
  Control,
  Controller,
  RaceSetup,
  RaceState,
  RiderId,
  RiderState,
} from "./state.ts";

export const MOST_SEATS = 8;
export const HOLD_TICKS = 6;
export const AUTO_AFTER_TICKS = 30;
export const INPUT_HORIZON = 90;
export const HASH_EVERY = 60;

const NO_TICK = -1;
const SEAT_COUNT_BYTES = 1;
const RIDER_BYTES = 1;
const COUNTER_BYTES = 4;
const FLAG_BYTES = 1;
const SEAT_HEAD_BYTES =
  RIDER_BYTES + CONTROL_BYTES + COUNTER_BYTES + COUNTER_BYTES + FLAG_BYTES;
const SLOT_BYTES = COUNTER_BYTES + CONTROL_BYTES;

const controlAt = (from: DataView, at: number): Control =>
  readControl(from, at) ??
  refuse("This seat record holds a control word the room cannot read.");

export const seatsCapacity = (seats: number): number =>
  SEAT_COUNT_BYTES + seats * (SEAT_HEAD_BYTES + INPUT_HORIZON * SLOT_BYTES);

export const roomSetup = <Setup extends RaceSetup>(
  setup: Setup,
  humans: readonly RiderId[]
): Setup => {
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

export const firstRacers = (
  setup: RaceSetup,
  count: number
): readonly RiderId[] => {
  const roster = rosterOf(setup);
  return [roster.player, ...roster.rivals].slice(0, count);
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
  missed: number;
  left: boolean;
}

const seatFor = (rider: RiderState): Seat => ({
  controls: Array.from({ length: INPUT_HORIZON }, () => coasting),
  last: coasting,
  left: false,
  missed: 0,
  rider,
  silent: 0,
  ticks: Array.from({ length: INPUT_HORIZON }, () => NO_TICK),
});

export const isDone = (rider: RiderState): boolean =>
  rider.finishTick >= 0 || rider.mode === "busted" || rider.mode === "wrecked";

export interface Room {
  readonly state: RaceState;
  readonly digest: Uint32Array;
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
  readonly missedControls: (rider: RiderId) => number;
  readonly over: () => boolean;
  readonly hashNow: () => Uint32Array;
  readonly step: () => void;
  readonly writeSeats: (out: DataView) => number;
  readonly readSeats: (from: DataView) => void;
}

const seatFrame = (
  seat: Seat,
  tick: number,
  frame: TickFrame,
  pilotFromTick: number
): void => {
  const { rider } = seat;
  const slot = tick % INPUT_HORIZON;
  if (seat.left || tick >= pilotFromTick) {
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
  if (!isDone(rider)) {
    seat.missed += 1;
  }
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

export const createRoom = (setup: RaceSetup, pilotFromTick: number): Room => {
  const state = createRace(setup);
  const digest = setupDigest(state, setup.track);
  const scratch = createScratch(state);
  const seats = seatsOf(state).map(seatFor);
  const seatOf = (rider: RiderId): Seat | undefined =>
    seats.find((seat) => seat.rider.id === rider);
  const hashedNow = new Uint32Array(HASH_WORDS);
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
    digest,
    frame: createTickFrame(),
    hash: new Uint32Array(HASH_WORDS),
    hashNow: () => {
      hashRace(state, digest, scratchFor(scratch, state), hashedNow);
      return hashedNow;
    },
    hashed: false,
    leave: (rider) => {
      const seat = seatOf(rider);
      if (seat) {
        seat.left = true;
      }
    },
    missedControls: (rider) => seatOf(rider)?.missed ?? 0,
    over: () => seats.every((seat) => seat.left || isDone(seat.rider)),
    readSeats: (from) => {
      const needed = seatsCapacity(seats.length);
      if (from.byteLength !== needed || from.getUint8(0) !== seats.length) {
        refuse(
          `The room's seats take ${needed} bytes for ${seats.length} seats and this record holds ${from.byteLength}.`
        );
      }
      let at = SEAT_COUNT_BYTES;
      for (const seat of seats) {
        if (riderIdAt(from.getUint8(at)) !== seat.rider.id) {
          refuse("This seat record was taken of another room's seats.");
        }
        at += RIDER_BYTES;
        seat.last = controlAt(from, at);
        at += CONTROL_BYTES;
        seat.silent = from.getUint32(at, true);
        at += COUNTER_BYTES;
        seat.missed = from.getUint32(at, true);
        at += COUNTER_BYTES;
        seat.left = from.getUint8(at) === 1;
        at += FLAG_BYTES;
        for (let slot = 0; slot < INPUT_HORIZON; slot += 1) {
          seat.ticks[slot] = from.getInt32(at, true);
          at += COUNTER_BYTES;
          seat.controls[slot] = controlAt(from, at);
          at += CONTROL_BYTES;
        }
      }
    },
    state,
    step: () => {
      const tick = state.tick + 1;
      clearFrame(room.frame, tick);
      for (const seat of seats) {
        seatFrame(seat, tick, room.frame, pilotFromTick);
      }
      stepRace(state, setup.track, room.frame);
      room.hashed = tick % HASH_EVERY === 0;
      if (room.hashed) {
        hashRace(state, digest, scratchFor(scratch, state), room.hash);
      }
    },
    writeSeats: (out) => {
      let at = 0;
      out.setUint8(at, seats.length);
      at += SEAT_COUNT_BYTES;
      for (const seat of seats) {
        out.setUint8(at, seat.rider.id);
        at += RIDER_BYTES;
        writeControl(out, at, seat.last);
        at += CONTROL_BYTES;
        out.setUint32(at, seat.silent, true);
        at += COUNTER_BYTES;
        out.setUint32(at, seat.missed, true);
        at += COUNTER_BYTES;
        out.setUint8(at, seat.left ? 1 : 0);
        at += FLAG_BYTES;
        for (let slot = 0; slot < INPUT_HORIZON; slot += 1) {
          out.setInt32(at, seat.ticks[slot] ?? NO_TICK, true);
          at += COUNTER_BYTES;
          writeControl(out, at, seat.controls[slot] ?? coasting);
          at += CONTROL_BYTES;
        }
      }
      return at;
    },
  };
  return room;
};
