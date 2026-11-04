import type { Room } from "@racer/sim/room";
import type { RiderId } from "@racer/sim/state";

import type { HostSocket } from "./host.ts";
import type { RaceSeat, SeatTally } from "./notes.ts";

export interface SeatLink {
  readonly colo: string | null;
  readonly tcpRttMs: number | null;
}

export interface Seat {
  readonly link: SeatLink;
  readonly name: string;
  readonly socket: HostSocket;
  rider: RiderId | null;
  accepted: number;
  ahead: number;
  late: number;
  leftAtTick: number | null;
  readyMs: number | null;
  reported: boolean;
  traced: boolean;
  tracedLate: number;
  tracedMissed: number;
}

export const seatFor = (
  socket: HostSocket,
  name: string,
  link: SeatLink
): Seat => ({
  accepted: 0,
  ahead: 0,
  late: 0,
  leftAtTick: null,
  link,
  name,
  readyMs: null,
  reported: false,
  rider: null,
  socket,
  traced: false,
  tracedLate: 0,
  tracedMissed: 0,
});

export const tallyOf = (seat: Seat, room: Room | null): readonly SeatTally[] =>
  seat.rider === null
    ? []
    : [
        {
          accepted: seat.accepted,
          ahead: seat.ahead,
          late: seat.late,
          missed: room?.missedControls(seat.rider) ?? 0,
          rider: seat.rider,
        },
      ];

export const raceSeatsOf = (
  riders: readonly Seat[],
  room: Room
): readonly RaceSeat[] =>
  riders.flatMap((seat) =>
    tallyOf(seat, room).flatMap((tally) => {
      const state = room.state.riders.find((rider) => rider.id === seat.rider);
      return state
        ? [
            {
              ...tally,
              colo: seat.link.colo,
              crashes: state.crashes,
              finishTick: state.finishTick,
              leftAtTick: seat.leftAtTick,
              mode: state.mode,
              readyMs: seat.readyMs,
              reported: seat.reported,
              roadMetres: Math.round(state.s),
              tcpRttMs: seat.link.tcpRttMs,
            },
          ]
        : [];
    })
  );

export const traceSeats = (
  riders: readonly Seat[],
  room: Room,
  trace: number[]
): void => {
  for (const seat of riders) {
    if (seat.rider !== null) {
      const missed = room.missedControls(seat.rider);
      if (missed !== seat.tracedMissed || seat.late !== seat.tracedLate) {
        trace.push(
          room.state.tick,
          seat.rider,
          missed - seat.tracedMissed,
          seat.late - seat.tracedLate
        );
        seat.tracedMissed = missed;
        seat.tracedLate = seat.late;
      }
    }
  }
};
