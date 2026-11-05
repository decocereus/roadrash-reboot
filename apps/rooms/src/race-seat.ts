import type { Room } from "@racer/sim/room";
import type { RaceStats } from "@racer/sim/room-wire";
import type { RiderId } from "@racer/sim/state";

import type { HostSocket } from "./host.ts";
import type { RaceManifest } from "./manifest.ts";
import type { RaceSeat, SeatTally } from "./notes.ts";
import type { SeatBrowser } from "./tape.ts";

export interface SeatLink {
  readonly asn: number | null;
  readonly colo: string | null;
  readonly network: string | null;
  readonly tcpRttMs: number | null;
}

export interface Seat {
  readonly colour: number;
  readonly link: SeatLink;
  readonly name: string;
  readonly socket: HostSocket;
  readonly traceRows: number[];
  rider: RiderId | null;
  accepted: number;
  ahead: number;
  browser: SeatBrowser | null;
  late: number;
  leftAtTick: number | null;
  readyMs: number | null;
  reported: boolean;
  stats: RaceStats | null;
  tracedLate: number;
  tracedMissed: number;
}

export const rosterOf = (
  room: Room,
  racerIds: readonly RiderId[],
  seats: readonly Seat[]
): RaceManifest["roster"] => {
  const seatOfRider = new Map(seats.map((seat) => [seat.rider, seat]));
  return racerIds.flatMap((rider) => {
    const state = room.state.riders.find((each) => each.id === rider);
    const seat = seatOfRider.get(rider);
    const name = seat?.name ?? null;
    return state
      ? [
          {
            bikeId: state.bike.id,
            colour: seat?.colour ?? null,
            kind: name === null ? ("ai" as const) : ("human" as const),
            name,
            rider,
          },
        ]
      : [];
  });
};

export const seatFor = (
  socket: HostSocket,
  name: string,
  colour: number,
  link: SeatLink
): Seat => ({
  accepted: 0,
  ahead: 0,
  browser: null,
  colour,
  late: 0,
  leftAtTick: null,
  link,
  name,
  readyMs: null,
  reported: false,
  rider: null,
  socket,
  stats: null,
  traceRows: [],
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
              asn: seat.link.asn,
              colo: seat.link.colo,
              crashes: state.crashes,
              finishTick: state.finishTick,
              leftAtTick: seat.leftAtTick,
              mode: state.mode,
              network: seat.link.network,
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
