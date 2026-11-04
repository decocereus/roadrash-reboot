import { ROOM_FIELD_SIZE, seatedRace } from "@racer/career/room-race";
import { createRoom, MOST_SEATS } from "@racer/sim/room";
import type { Room } from "@racer/sim/room";
import { createTapeWriter, hexOfWords } from "@racer/sim/room-tape";
import type { TapeWriter } from "@racer/sim/room-tape";
import {
  createInputBatch,
  isReady,
  readRaceStats,
  isStart,
  PONG_PACKET_BYTES,
  readInput,
  readPing,
  tickCapacity,
  writePong,
  writeTick,
} from "@racer/sim/room-wire";
import { TICK_SECONDS } from "@racer/sim/state";
import type { RiderId } from "@racer/sim/state";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { RoomStatus } from "./contract.ts";
import { encodeRoomMessage, SEAT_CLOSED, SEAT_SILENT } from "./messages.ts";
import type { RoomMessage } from "./messages.ts";
import { WAKE_GAP_CEILINGS_MS } from "./notes.ts";
import type { RaceSeat, RoomNote, SeatTally } from "./notes.ts";
import {
  BrowserTraceSchema,
  MOST_TRACE_CHARS,
  riderTraceName,
  ROOM_TRACE_EVERY_TICKS,
  roomTraceName,
  TAPE_VERSION,
  tapeEndName,
  tapeHeaderName,
  tapeKey,
  tapePartName,
} from "./tape.ts";
import type { RoomTrace } from "./tape.ts";

const TICK_MS = TICK_SECONDS * 1000;
const MOST_CATCH_UP_TICKS = 4;
const START_DELAY_MS = 3000;
const READY_DEADLINE_MS = 20_000;
const LOBBY_MS = 120_000;
const FILL_LEAST_MS = 8000;
const FILL_SPAN_MS = 10_000;
const NO_STAMP = 0;
const SILENT_SEAT_MS = 10_000;
const SEAT_WATCH_MS = 1000;
const SEND_FAILED = Number.NEGATIVE_INFINITY;

const decodeBrowserTrace = Schema.decodeUnknownOption(
  Schema.fromJsonString(BrowserTraceSchema)
);

export interface HostSocket {
  readonly send: (data: string | ArrayBufferView) => void;
  readonly close: (code: number, reason: string) => void;
}

interface SeatLink {
  readonly colo: string | null;
  readonly tcpRttMs: number | null;
}

export interface HostPorts {
  readonly build: string;
  readonly now: () => number;
  readonly after: (ms: number, wake: () => void) => void;
  readonly note: (note: RoomNote) => void;
  readonly raceId: () => string;
  readonly saveTape: (key: string, body: string | Uint8Array) => void;
  readonly seed: () => number;
}

interface Seat {
  readonly link: SeatLink;
  readonly name: string;
  readonly socket: HostSocket;
  rider: RiderId | null;
  accepted: number;
  ahead: number;
  heardAt: number;
  late: number;
  leftAtTick: number | null;
  readyMs: number | null;
  reported: boolean;
  traced: boolean;
  tracedLate: number;
  tracedMissed: number;
}

interface Lobby {
  readonly openedAt: number;
  readonly startsAt: number;
  fill: number;
}

interface Running {
  readonly loading: Set<HostSocket>;
  readonly raceId: string;
  readonly riders: readonly Seat[];
  readonly room: Room;
  readonly since: number;
  readonly tape: TapeWriter;
  readonly trace: number[];
  readonly wakeGaps: Uint32Array;
  lastWakeAt: number;
  startedAt: number | null;
}

export interface Host {
  readonly seat: (socket: HostSocket, name: string, link: SeatLink) => void;
  readonly message: (socket: HostSocket, data: string | ArrayBuffer) => void;
  readonly gone: (socket: HostSocket) => void;
  readonly status: () => RoomStatus;
}

const noteGap = (gaps: Uint32Array, gapMs: number): void => {
  let bucket = 0;
  while (
    bucket < WAKE_GAP_CEILINGS_MS.length &&
    gapMs > (WAKE_GAP_CEILINGS_MS[bucket] ?? gapMs)
  ) {
    bucket += 1;
  }
  gaps[bucket] = (gaps[bucket] ?? 0) + 1;
};

export const createHost = (ports: HostPorts): Host => {
  const seats = new Map<HostSocket, Seat>();
  const batch = createInputBatch();
  const tickBuffer = new ArrayBuffer(tickCapacity(MOST_SEATS));
  const tickView = new DataView(tickBuffer);
  const pongBuffer = new ArrayBuffer(PONG_PACKET_BYTES);
  const pongView = new DataView(pongBuffer);
  let lobby: Lobby | null = null;
  let running: Running | null = null;
  let wakes = 0;
  let catchUpWakes = 0;
  let worstBehindTicks = 0;
  let watching = false;

  const seatFor = (socket: HostSocket, name: string, link: SeatLink): Seat => ({
    accepted: 0,
    ahead: 0,
    heardAt: ports.now(),
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

  const sendTo = (seat: Seat, data: string | ArrayBufferView): void => {
    try {
      seat.socket.send(data);
    } catch {
      seat.heardAt = SEND_FAILED;
    }
  };

  const tell = (message: RoomMessage): void => {
    const text = encodeRoomMessage(message);
    for (const seat of seats.values()) {
      sendTo(seat, text);
    }
  };

  const ridersHere = (fill: number): number =>
    Math.min(ROOM_FIELD_SIZE, seats.size + fill);

  const tellLobby = (open: Lobby): void => {
    tell({
      kind: "lobby",
      names: [...seats.values()].map((seat) => seat.name),
      riders: ridersHere(open.fill),
      startsInMs: open.startsAt - ports.now(),
    });
  };

  const fillAfterGap = (open: Lobby): void => {
    ports.after(FILL_LEAST_MS + (ports.seed() % FILL_SPAN_MS), () => {
      if (lobby !== open) {
        return;
      }
      if (ridersHere(open.fill) < ROOM_FIELD_SIZE) {
        open.fill += 1;
        tellLobby(open);
      }
      fillAfterGap(open);
    });
  };

  const tallyOf = (seat: Seat, room: Room | null): readonly SeatTally[] =>
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

  const talliesOf = (room: Room | null): RoomStatus["seats"] =>
    [...seats.values()].flatMap((seat) => tallyOf(seat, room));

  const raceSeatsOf = (run: Running): readonly RaceSeat[] =>
    run.riders.flatMap((seat) =>
      tallyOf(seat, run.room).flatMap((tally) => {
        const state = run.room.state.riders.find(
          (rider) => rider.id === seat.rider
        );
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

  const end = (run: Running): void => {
    const { room, tape, trace } = run;
    tape.finish();
    ports.saveTape(
      tapeKey(run.raceId, roomTraceName),
      JSON.stringify({ rows: trace } satisfies RoomTrace)
    );
    ports.saveTape(
      tapeKey(run.raceId, tapeEndName),
      JSON.stringify({ parts: tape.parts(), tick: room.state.tick })
    );
    ports.note({
      catchUpWakes,
      kind: "ended",
      raceId: run.raceId,
      seats: raceSeatsOf(run),
      tick: room.state.tick,
      wakeGaps: [...run.wakeGaps],
      worstBehindTicks,
    });
    running = null;
    tell({ kind: "ended", tick: room.state.tick });
    for (const seat of seats.values()) {
      seat.socket.close(SEAT_CLOSED, "The race is over.");
    }
    seats.clear();
  };

  const traceSeats = ({ riders, room, trace }: Running): void => {
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

  const saveBrowserTrace = (seat: Seat, text: string): void => {
    if (
      !running ||
      seat.rider === null ||
      seat.traced ||
      text.length > MOST_TRACE_CHARS
    ) {
      return;
    }
    seat.traced = true;
    const decoded = decodeBrowserTrace(text);
    if (Option.isNone(decoded)) {
      return;
    }
    const { build, gpu, graphics } = decoded.value;
    ports.note({
      build,
      gpu,
      graphics,
      kind: "browser",
      raceId: running.raceId,
      rider: seat.rider,
    });
    ports.saveTape(
      tapeKey(running.raceId, riderTraceName(seat.rider)),
      JSON.stringify(decoded.value)
    );
  };

  const stepOnce = (run: Running): void => {
    const { room, tape } = run;
    room.step();
    if (room.state.tick % ROOM_TRACE_EVERY_TICKS === 0) {
      traceSeats(run);
    }
    const bytes = writeTick(
      tickView,
      room.frame,
      room.hashed ? room.hash : null
    );
    const packet = new Uint8Array(tickBuffer, 0, bytes);
    tape.add(packet);
    for (const seat of seats.values()) {
      sendTo(seat, packet);
    }
  };

  const wake = (): void => {
    if (!running) {
      return;
    }
    const run = running;
    const { room, startedAt } = run;
    if (startedAt === null) {
      return;
    }
    wakes += 1;
    const now = ports.now();
    noteGap(run.wakeGaps, now - run.lastWakeAt);
    run.lastWakeAt = now;
    const behind = Math.floor((now - startedAt) / TICK_MS) - room.state.tick;
    worstBehindTicks = Math.max(worstBehindTicks, behind);
    if (behind > 1) {
      catchUpWakes += 1;
    }
    const steps = Math.min(behind, MOST_CATCH_UP_TICKS);
    for (let step = 0; step < steps; step += 1) {
      stepOnce(run);
      if (room.over()) {
        end(run);
        return;
      }
    }
    const nextAt = startedAt + (room.state.tick + 1) * TICK_MS;
    ports.after(
      behind > steps ? 0 : Math.max(1, Math.ceil(nextAt - ports.now())),
      wake
    );
  };

  const countDown = (run: Running): void => {
    if (run !== running || run.startedAt !== null) {
      return;
    }
    ports.note({
      kind: "countdown",
      raceId: run.raceId,
      stillLoading: run.riders.flatMap((seat) =>
        run.loading.has(seat.socket) && seat.rider !== null ? [seat.rider] : []
      ),
      waitedMs: ports.now() - run.since,
    });
    run.startedAt = ports.now() + START_DELAY_MS;
    run.lastWakeAt = run.startedAt;
    tell({ kind: "countdown", startsInMs: START_DELAY_MS });
    ports.after(START_DELAY_MS, wake);
  };

  const countDownOnceLoaded = (run: Running): void => {
    if (run.loading.size === 0) {
      countDown(run);
    }
  };

  const start = (): void => {
    if (running || seats.size === 0) {
      return;
    }
    const lobbyMs = lobby ? ports.now() - lobby.openedAt : 0;
    lobby = null;
    wakes = 0;
    catchUpWakes = 0;
    worstBehindTicks = 0;
    const seed = ports.seed();
    const raceId = ports.raceId();
    const { humans, road, setup } = seatedRace(seed, seats.size);
    const room = createRoom(setup);
    const digest = hexOfWords(room.digest);
    ports.saveTape(
      tapeKey(raceId, tapeHeaderName),
      JSON.stringify({
        build: ports.build,
        digest,
        raceId,
        road,
        seats: seats.size,
        seed,
        version: TAPE_VERSION,
      })
    );
    let at = 0;
    for (const seat of seats.values()) {
      const rider = humans[at];
      seat.rider = rider ?? null;
      at += 1;
    }
    const run: Running = {
      lastWakeAt: 0,
      loading: new Set(seats.keys()),
      raceId,
      riders: [...seats.values()],
      room,
      since: ports.now(),
      startedAt: null,
      tape: createTapeWriter(tickBuffer.byteLength, (part, bytes) => {
        ports.saveTape(tapeKey(raceId, tapePartName(part)), bytes);
      }),
      trace: [],
      wakeGaps: new Uint32Array(WAKE_GAP_CEILINGS_MS.length + 1),
    };
    running = run;
    const names = [...seats.values()].map((seat) => seat.name);
    ports.note({
      at: ports.now(),
      build: ports.build,
      digest,
      kind: "started",
      lobbyMs,
      raceId,
      road,
      seats: humans.length,
      seed,
    });
    for (const seat of seats.values()) {
      sendTo(
        seat,
        encodeRoomMessage({
          digest: [...room.digest],
          kind: "started",
          names,
          raceId,
          seats: humans.length,
          seed,
          you: seat.rider ?? 0,
        })
      );
    }
    ports.after(READY_DEADLINE_MS, () => {
      countDown(run);
    });
  };

  const drop = (seat: Seat): void => {
    seats.delete(seat.socket);
    if (running && seat.rider !== null) {
      const { loading, raceId, room } = running;
      room.leave(seat.rider);
      seat.leftAtTick = room.state.tick;
      loading.delete(seat.socket);
      for (const tally of tallyOf(seat, room)) {
        ports.note({
          kind: "left",
          raceId,
          seatsLeft: seats.size,
          tally,
          tick: room.state.tick,
        });
      }
      countDownOnceLoaded(running);
    }
    if (seats.size === 0) {
      lobby = null;
    } else if (lobby) {
      tellLobby(lobby);
    }
  };

  const watchSeats = (): void => {
    const now = ports.now();
    for (const seat of seats.values()) {
      if (now - seat.heardAt > SILENT_SEAT_MS) {
        if (seat.heardAt !== SEND_FAILED) {
          seat.socket.close(SEAT_SILENT, "The room stopped hearing this seat.");
        }
        drop(seat);
      }
    }
    watching = seats.size > 0;
    if (watching) {
      ports.after(SEAT_WATCH_MS, watchSeats);
    }
  };

  const openLobby = (): Lobby => {
    const open: Lobby = {
      fill: 0,
      openedAt: ports.now(),
      startsAt: ports.now() + LOBBY_MS,
    };
    lobby = open;
    ports.after(LOBBY_MS, () => {
      if (lobby === open) {
        start();
      }
    });
    fillAfterGap(open);
    return open;
  };

  return {
    gone: (socket) => {
      const seat = seats.get(socket);
      if (seat) {
        drop(seat);
      }
    },
    message: (socket, data) => {
      const seat = seats.get(socket);
      if (!seat) {
        return;
      }
      seat.heardAt = ports.now();
      if (!(data instanceof ArrayBuffer)) {
        saveBrowserTrace(seat, data);
        return;
      }
      const view = new DataView(data);
      if (readInput(view, batch)) {
        if (running && seat.rider !== null) {
          const tally = running.room.accept(
            seat.rider,
            batch.firstTick,
            batch.controls
          );
          seat.accepted += tally.accepted;
          seat.ahead += tally.ahead;
          seat.late += tally.late;
        }
        return;
      }
      const stamp = readPing(view);
      if (stamp >= NO_STAMP) {
        const tick = running ? running.room.state.tick : 0;
        const bytes = writePong(pongView, stamp, tick);
        sendTo(seat, new Uint8Array(pongBuffer, 0, bytes));
        return;
      }
      if (isStart(view)) {
        start();
        return;
      }
      if (running && isReady(view)) {
        running.loading.delete(socket);
        seat.readyMs ??= ports.now() - running.since;
        countDownOnceLoaded(running);
        return;
      }
      const stats = readRaceStats(view);
      if (stats && !seat.reported && running && seat.rider !== null) {
        seat.reported = true;
        ports.note({
          kind: "stats",
          raceId: running.raceId,
          rider: seat.rider,
          stats,
        });
      }
    },
    seat: (socket, name, link) => {
      if (running || seats.size >= MOST_SEATS) {
        const reason = running ? "racing" : "full";
        ports.note({ kind: "refused", reason });
        socket.send(encodeRoomMessage({ kind: "refused", reason }));
        socket.close(SEAT_CLOSED, reason);
        return;
      }
      seats.set(socket, seatFor(socket, name, link));
      if (!watching) {
        watching = true;
        ports.after(SEAT_WATCH_MS, watchSeats);
      }
      tellLobby(lobby ?? openLobby());
    },
    status: () => ({
      catchUpWakes,
      names: [...seats.values()].map((seat) => seat.name),
      phase: running ? "racing" : "waiting",
      raceId: running?.raceId ?? null,
      seats: talliesOf(running?.room ?? null),
      tick: running ? running.room.state.tick : 0,
      waiting: seats.size,
      wakes,
      worstBehindTicks,
    }),
  };
};
