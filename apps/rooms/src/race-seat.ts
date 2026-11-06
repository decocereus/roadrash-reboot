import type { Room } from "@racer/sim/room";
import { readRaceStats } from "@racer/sim/room-wire";
import type { RaceStats } from "@racer/sim/room-wire";
import type { RiderId } from "@racer/sim/state";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { RaceManifest } from "./manifest.ts";
import type { RaceSeat, RoomNote, SeatTally } from "./notes.ts";
import {
  BrowserTraceSchema,
  MOST_TRACE_CHARS,
  MOST_TRACE_ROW_VALUES,
  riderTraceName,
  tapeKey,
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

export type SeatPresence =
  | { readonly kind: "here" }
  | { readonly kind: "held"; readonly since: number }
  | { readonly kind: "left"; readonly tick: number };

export const HERE: SeatPresence = { kind: "here" };

export interface Seat {
  readonly colour: number;
  readonly link: SeatLink;
  readonly memberId: string;
  readonly name: string;
  readonly raceId: string;
  readonly rider: RiderId;
  readonly traceRows: number[];
  readonly tracedConnections: number[][];
  accepted: number;
  ahead: number;
  browser: SeatBrowser | null;
  late: number;
  presence: SeatPresence;
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
  { link, memberId, name }: Pick<Seat, "link" | "memberId" | "name">,
  colour: number,
  raceId: string,
  rider: RiderId
): Seat => ({
  accepted: 0,
  ahead: 0,
  browser: null,
  colour,
  late: 0,
  link,
  memberId,
  name,
  presence: HERE,
  raceId,
  readyMs: null,
  reported: false,
  rider,
  stats: null,
  traceRows: [],
  tracedConnections: [],
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
  const kept = seat.tracedConnections.reduce(
    (sum, connection) => sum + connection.length,
    seat.traceRows.length
  );
  if (kept + rows.length <= MOST_TRACE_ROW_VALUES) {
    seat.browser = browser;
    seat.traceRows.push(...rows);
  }
};

interface ReportPorts {
  readonly note: (note: RoomNote) => void;
  readonly saveTape: (key: string, body: string) => void;
}

export const settleReport = (seat: Seat, ports: ReportPorts): void => {
  const { browser, raceId, rider, stats, traceRows, tracedConnections } = seat;
  if (stats) {
    ports.note({ kind: "stats", raceId, rider, stats });
  }
  if (traceRows.length > 0) {
    tracedConnections.push([...traceRows]);
    traceRows.length = 0;
  }
  if (browser) {
    ports.note({ ...browser, kind: "browser", raceId, rider });
    ports.saveTape(
      tapeKey(raceId, riderTraceName(rider)),
      JSON.stringify({ ...browser, connections: tracedConnections })
    );
  }
  seat.stats = null;
  seat.browser = null;
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
  riders.flatMap(({ presence, readyMs, rider }) =>
    presence.kind === "here" && readyMs === null ? [rider] : []
  );

const leftAtTickOf = (presence: SeatPresence): number | null =>
  presence.kind === "left" ? presence.tick : null;

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
            leftAtTick: leftAtTickOf(seat.presence),
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
