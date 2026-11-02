import { seatedRace } from "@racer/career/room-race";
import { createRoom, MOST_SEATS } from "@racer/sim/room";
import type { Room } from "@racer/sim/room";
import {
  createInputBatch,
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

import type { RoomStatus } from "./contract.ts";
import { encodeRoomMessage, SEAT_CLOSED } from "./messages.ts";
import type { RoomMessage } from "./messages.ts";

const TICK_MS = TICK_SECONDS * 1000;
const MOST_CATCH_UP_TICKS = 4;
const START_DELAY_MS = 3000;
const NO_STAMP = 0;

export interface HostSocket {
  readonly send: (data: string | ArrayBufferView) => void;
  readonly close: (code: number, reason: string) => void;
}

export interface HostPorts {
  readonly now: () => number;
  readonly after: (ms: number, wake: () => void) => void;
  readonly seed: () => number;
}

interface Seat {
  readonly socket: HostSocket;
  rider: RiderId | null;
  accepted: number;
  ahead: number;
  late: number;
}

interface Running {
  readonly room: Room;
  readonly startedAt: number;
}

export interface Host {
  readonly seat: (socket: HostSocket) => void;
  readonly rejoin: (socket: HostSocket) => void;
  readonly message: (socket: HostSocket, data: string | ArrayBuffer) => void;
  readonly gone: (socket: HostSocket) => void;
  readonly status: () => RoomStatus;
}

export const createHost = (ports: HostPorts): Host => {
  const seats = new Map<HostSocket, Seat>();
  const batch = createInputBatch();
  const tickBuffer = new ArrayBuffer(tickCapacity(MOST_SEATS));
  const tickView = new DataView(tickBuffer);
  const pongBuffer = new ArrayBuffer(PONG_PACKET_BYTES);
  const pongView = new DataView(pongBuffer);
  let running: Running | null = null;
  let wakes = 0;
  let catchUpWakes = 0;
  let worstBehindTicks = 0;

  const seatFor = (socket: HostSocket): Seat => ({
    accepted: 0,
    ahead: 0,
    late: 0,
    rider: null,
    socket,
  });

  const leave = (seat: Seat): void => {
    seats.delete(seat.socket);
    if (running && seat.rider !== null) {
      running.room.leave(seat.rider);
    }
  };

  const sendTo = (seat: Seat, data: string | ArrayBufferView): void => {
    try {
      seat.socket.send(data);
    } catch {
      leave(seat);
    }
  };

  const tell = (message: RoomMessage): void => {
    const text = encodeRoomMessage(message);
    for (const seat of seats.values()) {
      sendTo(seat, text);
    }
  };

  const end = (room: Room): void => {
    running = null;
    tell({ kind: "ended", tick: room.state.tick });
    for (const seat of seats.values()) {
      seat.socket.close(SEAT_CLOSED, "The race is over.");
    }
    seats.clear();
  };

  const stepOnce = (room: Room): void => {
    room.step();
    const bytes = writeTick(
      tickView,
      room.frame,
      room.hashed ? room.hash : null
    );
    const packet = new Uint8Array(tickBuffer, 0, bytes);
    for (const seat of seats.values()) {
      sendTo(seat, packet);
    }
  };

  const wake = (): void => {
    if (!running) {
      return;
    }
    const { room, startedAt } = running;
    wakes += 1;
    const behind =
      Math.floor((ports.now() - startedAt) / TICK_MS) - room.state.tick;
    worstBehindTicks = Math.max(worstBehindTicks, behind);
    if (behind > 1) {
      catchUpWakes += 1;
    }
    const steps = Math.min(behind, MOST_CATCH_UP_TICKS);
    for (let step = 0; step < steps; step += 1) {
      stepOnce(room);
      if (room.over()) {
        end(room);
        return;
      }
    }
    const nextAt = startedAt + (room.state.tick + 1) * TICK_MS;
    ports.after(
      behind > steps ? 0 : Math.max(1, Math.ceil(nextAt - ports.now())),
      wake
    );
  };

  const start = (): void => {
    if (running || seats.size === 0) {
      return;
    }
    const seed = ports.seed();
    const { humans, setup } = seatedRace(seed, seats.size);
    const room = createRoom(setup);
    let at = 0;
    for (const seat of seats.values()) {
      const rider = humans[at];
      seat.rider = rider ?? null;
      at += 1;
    }
    const startedAt = ports.now() + START_DELAY_MS;
    running = { room, startedAt };
    for (const seat of seats.values()) {
      sendTo(
        seat,
        encodeRoomMessage({
          digest: [...room.digest],
          kind: "started",
          seats: humans.length,
          seed,
          startsInMs: START_DELAY_MS,
          you: seat.rider ?? 0,
        })
      );
    }
    ports.after(START_DELAY_MS, wake);
  };

  return {
    gone: (socket) => {
      const seat = seats.get(socket);
      if (!seat) {
        return;
      }
      leave(seat);
      if (!running) {
        tell({ kind: "lobby", seats: seats.size });
      }
    },
    message: (socket, data) => {
      const seat = seats.get(socket);
      if (!seat || !(data instanceof ArrayBuffer)) {
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
      }
    },
    rejoin: (socket) => {
      seats.set(socket, seatFor(socket));
    },
    seat: (socket) => {
      if (running || seats.size >= MOST_SEATS) {
        const reason = running ? "racing" : "full";
        socket.send(encodeRoomMessage({ kind: "refused", reason }));
        socket.close(SEAT_CLOSED, reason);
        return;
      }
      seats.set(socket, seatFor(socket));
      tell({ kind: "lobby", seats: seats.size });
    },
    status: () => ({
      catchUpWakes,
      phase: running ? "racing" : "waiting",
      seats: [...seats.values()].flatMap((seat) =>
        seat.rider === null
          ? []
          : [
              {
                accepted: seat.accepted,
                ahead: seat.ahead,
                late: seat.late,
                rider: seat.rider,
              },
            ]
      ),
      tick: running ? running.room.state.tick : 0,
      waiting: seats.size,
      wakes,
      worstBehindTicks,
    }),
  };
};
