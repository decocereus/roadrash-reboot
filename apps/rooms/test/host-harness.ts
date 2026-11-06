import { seatedRace } from "@racer/career/room-race";
import { createRoomClient } from "@racer/sim/room-client";
import type { RoomClient } from "@racer/sim/room-client";
import { createTickFrame } from "@racer/sim/room-frame";
import {
  createReadTick,
  PING_PACKET_BYTES,
  READY_PACKET_BYTES,
  readTick,
  ROOM_PROTOCOL,
  writePing,
  writeReady,
} from "@racer/sim/room-wire";
import type { RaceStats } from "@racer/sim/room-wire";
import { riderIdAt } from "@racer/sim/state";
import * as Option from "effect/Option";
import { expect } from "vitest";

import { createHost } from "../src/host.ts";
import type { Host, HostPorts, HostSocket } from "../src/host.ts";
import { seatedCount } from "../src/manifest.ts";
import { decodeRoomMessage, encodeLobbyCommand } from "../src/messages.ts";
import type { RoomMessage } from "../src/messages.ts";
import type { RoomNote } from "../src/notes.ts";

export const nearby = {
  asn: 64_512,
  colo: "DEL",
  network: "Test Net",
  tcpRttMs: 8,
};
let claims = 0;
export const sameBuild = (key = "") => {
  claims += 1;
  return {
    build: "test-build",
    key: key === "" ? `key-${claims}` : key,
    protocol: ROOM_PROTOCOL,
  };
};
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
    roomColo: () => "SIN",
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

export const pingPacket = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(PING_PACKET_BYTES);
  writePing(new DataView(buffer), 1);
  return buffer;
};

export const advanceHearing = (
  host: Host,
  clock: Clock,
  sockets: readonly FakeSocket[],
  ms: number
): void => {
  for (let passed = 0; passed < ms; passed += 1000) {
    clock.advance(Math.min(1000, ms - passed));
    for (const socket of sockets) {
      host.message(socket, pingPacket());
    }
  }
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

export const countdownsOn = (socket: FakeSocket): number =>
  socket.messages.filter((each) => each.kind === "countdown").length;

export const lastLobby = (socket: FakeSocket) => {
  const message = socket.messages.findLast((each) => each.kind === "lobby");
  if (message?.kind !== "lobby") {
    throw new Error("The room never told this seat about its lobby.");
  }
  return message;
};

export const readyAll = (host: Host, sockets: readonly FakeSocket[]): void => {
  for (const socket of sockets) {
    host.message(
      socket,
      encodeLobbyCommand({
        edition: lastLobby(socket).edition,
        kind: "ready",
        ready: true,
      })
    );
  }
};

export const loadingRace = () => {
  const clock = createClock();
  const host = createHost(clock);
  const near = fakeSocket();
  const far = fakeSocket();
  host.seat(near, "Near", nearby, sameBuild());
  host.seat(far, "Far", nearby, sameBuild());
  readyAll(host, [near, far]);
  return { clock, far, host, near };
};

export const startedOf = (socket: FakeSocket) => {
  const message = socket.messages.find((each) => each.kind === "started");
  if (message?.kind !== "started") {
    throw new Error("The room never said the race started.");
  }
  return message;
};

export const readyPacket = (socket: FakeSocket): ArrayBuffer => {
  const buffer = new ArrayBuffer(READY_PACKET_BYTES);
  writeReady(
    new DataView(buffer),
    new Uint32Array(startedOf(socket).manifest.contentHash)
  );
  return buffer;
};

export const clientOf = (socket: FakeSocket): RoomClient => {
  const started = startedOf(socket);
  const { setup } = seatedRace(
    started.manifest.seed,
    seatedCount(started.manifest),
    started.manifest.rule
  );
  return createRoomClient(setup, riderIdAt(started.you));
};

export const race = (
  host: Host,
  clock: Clock,
  sockets: readonly FakeSocket[]
) => {
  for (const socket of sockets) {
    host.seat(socket, "Guest", nearby, sameBuild());
  }
  readyAll(host, sockets);
  for (const socket of sockets) {
    host.message(socket, readyPacket(socket));
  }
  clock.advance(START_DELAY_MS);
};

export const followTicks = (socket: FakeSocket, client: RoomClient): void => {
  const read = createReadTick(createTickFrame());
  for (const packet of socket.ticks.splice(0)) {
    expect(readTick(packet, read)).toBeTruthy();
    client.confirm(read.frame, read.hashed ? read.hash : null);
  }
};

export const room = () => {
  const clock = createClock();
  const host = createHost(clock);
  const connecting = (key: string, name = "Guest"): FakeSocket => {
    const socket = fakeSocket();
    host.seat(socket, name, nearby, sameBuild(key));
    return socket;
  };
  const seated = (key: string, name = "Guest"): FakeSocket => {
    const socket = connecting(key, name);
    host.message(socket, pingPacket());
    return socket;
  };
  return { clock, connecting, host, seated };
};
