import type { Room } from "@racer/sim/room";
import { readRaceStats } from "@racer/sim/room-wire";
import type { RaceStats } from "@racer/sim/room-wire";
import type { RiderId } from "@racer/sim/state";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { RaceManifest } from "./manifest.ts";
import type { RaceSeat, SeatTally } from "./notes.ts";
import {
  BrowserTraceSchema,
  MOST_TRACE_CHARS,
  MOST_TRACE_ROW_VALUES,
} from "./tape.ts";
import type { SeatBrowser } from "./tape.ts";

const decodeBrowserTrace = Schema.decodeUnknownOption(
  Schema.fromJsonString(BrowserTraceSchema)
);

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
  readonly raceId: string;
  readonly rider: RiderId;
  readonly traceRows: number[];
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
  { link, name }: Pick<Seat, "link" | "name">,
  colour: number,
  raceId: string,
  rider: RiderId
): Seat => ({
  accepted: 0,
  ahead: 0,
  browser: null,
  colour,
  late: 0,
  leftAtTick: null,
  link,
  name,
  raceId,
  readyMs: null,
  reported: false,
  rider,
  stats: null,
  traceRows: [],
  tracedLate: 0,
  tracedMissed: 0,
});

export const keepBrowserRows = (seat: Seat, text: string): void => {
  if (text.length > MOST_TRACE_CHARS) {
    return;
  }
  const decoded = decodeBrowserTrace(text);
  if (Option.isNone(decoded)) {
    return;
  }
  const { rows, ...browser } = decoded.value;
  if (seat.traceRows.length + rows.length <= MOST_TRACE_ROW_VALUES) {
    seat.browser = browser;
    seat.traceRows.push(...rows);
  }
};

export const keepStats = (seat: Seat, view: DataView): void => {
  const stats = readRaceStats(view);
  if (stats) {
    seat.reported = true;
    seat.stats = stats;
  }
};

export const keepReport = (seat: Seat, data: string | ArrayBuffer): void => {
  if (data instanceof ArrayBuffer) {
    keepStats(seat, new DataView(data));
  } else {
    keepBrowserRows(seat, data);
  }
};

export const stillLoading = (riders: readonly Seat[]): readonly RiderId[] =>
  riders.flatMap(({ leftAtTick, readyMs, rider }) =>
    leftAtTick === null && readyMs === null ? [rider] : []
  );

export const tallyOf = (seat: Seat, room: Room): SeatTally => ({
  accepted: seat.accepted,
  ahead: seat.ahead,
  late: seat.late,
  missed: room.missedControls(seat.rider),
  rider: seat.rider,
});

export const raceSeatsOf = (
  riders: readonly Seat[],
  room: Room
): readonly RaceSeat[] =>
  riders.flatMap((seat) => {
    const state = room.state.riders.find((rider) => rider.id === seat.rider);
    return state
      ? [
          {
            ...tallyOf(seat, room),
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
  });

export const traceSeats = (
  riders: readonly Seat[],
  room: Room,
  trace: number[]
): void => {
  for (const seat of riders) {
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
};
