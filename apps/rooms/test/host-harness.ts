import { seatedRace } from "@racer/career/room-race";
import { createRoomClient } from "@racer/sim/room-client";
import type { RoomClient } from "@racer/sim/room-client";
import { createTickFrame } from "@racer/sim/room-frame";
import {
  createReadTick,
  READY_PACKET_BYTES,
  readTick,
  START_PACKET_BYTES,
  writeReady,
  writeStart,
} from "@racer/sim/room-wire";
import type { RaceStats } from "@racer/sim/room-wire";
import { riderIdAt } from "@racer/sim/state";
import * as Option from "effect/Option";
import { expect } from "vitest";

import { createHost } from "../src/host.ts";
import type { Host, HostPorts, HostSocket } from "../src/host.ts";
import { decodeRoomMessage } from "../src/messages.ts";
import type { RoomMessage } from "../src/messages.ts";
import type { RoomNote } from "../src/notes.ts";

export const nearby = { colo: "DEL", tcpRttMs: 8 };
export const TICK_MS = 1000 / 60;
export const START_DELAY_MS = 3000;

export interface Clock extends HostPorts {
  readonly advance: (ms: number) => void;
  readonly notes: RoomNote[];
  readonly tape: Map<string, string | Uint8Array>;
  readonly stall: (ms: number) => void;
  readonly wakeOnce: () => void;
  readonly pending: () => number;
}

export const createClock = (): Clock => {
  let at = 1000;
  let timers: { due: number; wake: () => void }[] = [];
  const notes: RoomNote[] = [];
  const tape = new Map<string, string | Uint8Array>();
  let races = 0;
  const nextBy = (until: number) =>
    timers
      .filter((timer) => timer.due <= until)
      .toSorted((left, right) => left.due - right.due)[0];
  const fire = (next: { due: number; wake: () => void }): void => {
    timers = timers.filter((timer) => timer !== next);
    at = Math.max(at, next.due);
    next.wake();
  };
  return {
    advance: (ms) => {
      const until = at + ms;
      for (let next = nextBy(until); next; next = nextBy(until)) {
        fire(next);
      }
      at = until;
    },
    after: (ms, wake) => {
      timers.push({ due: at + ms, wake });
    },
    build: "test-build",
    note: (note) => {
      notes.push(note);
    },
    notes,
    now: () => at,
    pending: () => timers.length,
    raceId: () => {
      races += 1;
      return `race-${races}`;
    },
    saveTape: (key, body) => {
      tape.set(key, body);
    },
    seed: () => 7,
    stall: (ms) => {
      at += ms;
    },
    tape,
    wakeOnce: () => {
      const next = nextBy(at);
      if (next) {
        fire(next);
      }
    },
  };
};

export interface FakeSocket extends HostSocket {
  readonly messages: RoomMessage[];
  readonly ticks: DataView[];
  readonly pongs: DataView[];
  closed: number | null;
}

export const fakeSocket = (): FakeSocket => {
  const messages: RoomMessage[] = [];
  const ticks: DataView[] = [];
  const pongs: DataView[] = [];
  const socket: FakeSocket = {
    close: (code) => {
      socket.closed = code;
    },
    closed: null,
    messages,
    pongs,
    send: (data) => {
      if (!ArrayBuffer.isView(data)) {
        const decoded = decodeRoomMessage(data);
        if (Option.isSome(decoded)) {
          messages.push(decoded.value);
        }
        return;
      }
      const copy = new DataView(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      );
      (copy.byteLength === 9 && copy.getUint8(0) === 4 ? pongs : ticks).push(
        copy
      );
    },
    ticks,
  };
  return socket;
};

export const startPacket = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(START_PACKET_BYTES);
  writeStart(new DataView(buffer));
  return buffer;
};

export const someRaceStats: RaceStats = {
  crashes: 2,
  crashesAfterCorrection: 1,
  desyncs: 0,
  doubledSteps: 2,
  finished: 1,
  frameCount: 900,
  frameP50Ms: 16,
  frameP95Ms: 18,
  frameP99Ms: 25,
  heldSteps: 3,
  jumpsBehindServer: 0,
  jumpsOtherRiders: 1,
  jumpsOwnControl: 4,
  mostSteps: 3,
  refusedPredictions: 0,
  resimulatedTicks: 90,
  rollbacks: 7,
  rttMeanMs: 95,
  rttWorstMs: 204,
  slowFrames: 1,
  tick: 11_909,
  totalBehindServerCm: 0,
  totalOtherRidersCm: 12,
  totalOwnControlCm: 240,
  worstBehindServerCm: 0,
  worstFrameMs: 61,
  worstFrameRoadMetres: 812,
  worstJumpRoadMetres: 1430,
  worstJumpTick: 4321,
  worstOtherRidersCm: 12,
  worstOwnControlCm: 88,
};

export const readyPacket = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(READY_PACKET_BYTES);
  writeReady(new DataView(buffer));
  return buffer;
};

export const countdownsOn = (socket: FakeSocket): number =>
  socket.messages.filter((each) => each.kind === "countdown").length;

export const pressedStart = () => {
  const clock = createClock();
  const host = createHost(clock);
  const near = fakeSocket();
  const far = fakeSocket();
  host.seat(near, "Near", nearby);
  host.seat(far, "Far", nearby);
  host.message(near, startPacket());
  return { clock, far, host, near };
};

export const startedOf = (socket: FakeSocket) => {
  const message = socket.messages.find((each) => each.kind === "started");
  if (message?.kind !== "started") {
    throw new Error("The room never said the race started.");
  }
  return message;
};

export const clientOf = (socket: FakeSocket): RoomClient => {
  const started = startedOf(socket);
  const { setup } = seatedRace(started.seed, started.seats);
  return createRoomClient(setup, riderIdAt(started.you));
};

export const race = (
  host: Host,
  clock: Clock,
  sockets: readonly FakeSocket[]
) => {
  for (const socket of sockets) {
    host.seat(socket, "Guest", nearby);
  }
  const [first] = sockets;
  if (!first) {
    throw new Error("A race needs a seat.");
  }
  host.message(first, startPacket());
  for (const socket of sockets) {
    host.message(socket, readyPacket());
  }
  clock.advance(START_DELAY_MS);
};

export const seatOn = (host: Host): FakeSocket => {
  const socket = fakeSocket();
  host.seat(socket, "Guest", nearby);
  return socket;
};

export const lobbyWithOneSeat = () => {
  const clock = createClock();
  const host = createHost(clock);
  const socket = seatOn(host);
  return { clock, host, messages: socket.messages, socket };
};

export const lobbyCounts = (
  messages: readonly RoomMessage[]
): readonly number[] =>
  messages.flatMap((message) =>
    message.kind === "lobby" ? [message.riders] : []
  );

export const followTicks = (socket: FakeSocket, client: RoomClient): void => {
  const read = createReadTick(createTickFrame());
  for (const packet of socket.ticks.splice(0)) {
    expect(readTick(packet, read)).toBeTruthy();
    client.confirm(read.frame, read.hashed ? read.hash : null);
  }
};
