import { seatedRace } from "@racer/career/room-race";
import { controlOf } from "@racer/sim/control";
import { createRoomClient } from "@racer/sim/room-client";
import type { RoomClient } from "@racer/sim/room-client";
import { createTickFrame } from "@racer/sim/room-frame";
import {
  createReadTick,
  inputBytes,
  MOST_BATCHED_CONTROLS,
  PING_PACKET_BYTES,
  readPong,
  readTick,
  START_PACKET_BYTES,
  writePing,
  writeStart,
} from "@racer/sim/room-wire";
import { riderIdAt } from "@racer/sim/state";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import type { Host, HostPorts, HostSocket } from "../src/host.ts";
import { decodeRoomMessage, SEAT_CLOSED } from "../src/messages.ts";
import type { RoomMessage } from "../src/messages.ts";

const TICK_MS = 1000 / 60;
const START_DELAY_MS = 3000;

interface Clock extends HostPorts {
  readonly advance: (ms: number) => void;
  readonly stall: (ms: number) => void;
  readonly wakeOnce: () => void;
  readonly pending: () => number;
}

const createClock = (): Clock => {
  let at = 1000;
  let timers: { due: number; wake: () => void }[] = [];
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
    now: () => at,
    pending: () => timers.length,
    seed: () => 7,
    stall: (ms) => {
      at += ms;
    },
    wakeOnce: () => {
      const next = nextBy(at);
      if (next) {
        fire(next);
      }
    },
  };
};

interface FakeSocket extends HostSocket {
  readonly messages: RoomMessage[];
  readonly ticks: DataView[];
  readonly pongs: DataView[];
  closed: number | null;
}

const fakeSocket = (): FakeSocket => {
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

const startPacket = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(START_PACKET_BYTES);
  writeStart(new DataView(buffer));
  return buffer;
};

const startedOf = (socket: FakeSocket) => {
  const message = socket.messages.find((each) => each.kind === "started");
  if (message?.kind !== "started") {
    throw new Error("The room never said the race started.");
  }
  return message;
};

const clientOf = (socket: FakeSocket): RoomClient => {
  const started = startedOf(socket);
  const { setup } = seatedRace(started.seed, started.seats);
  return createRoomClient(setup, riderIdAt(started.you));
};

const race = (host: Host, clock: Clock, sockets: readonly FakeSocket[]) => {
  for (const socket of sockets) {
    host.seat(socket);
  }
  const [first] = sockets;
  if (!first) {
    throw new Error("A race needs a seat.");
  }
  host.message(first, startPacket());
  clock.advance(START_DELAY_MS);
};

const followTicks = (socket: FakeSocket, client: RoomClient): void => {
  const read = createReadTick(createTickFrame());
  for (const packet of socket.ticks.splice(0)) {
    expect(readTick(packet, read)).toBeTruthy();
    client.confirm(read.frame, read.hashed ? read.hash : null);
  }
};

describe("a room host", () => {
  it("races two clients through its packets and agrees with them hash for hash", () => {
    const clock = createClock();
    const host = createHost(clock);
    const sockets = [fakeSocket(), fakeSocket()];
    race(host, clock, sockets);
    const clients = sockets.map(clientOf);
    const buffer = new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS));
    const view = new DataView(buffer);
    for (let frame = 0; frame < 1200; frame += 1) {
      for (const [at, socket] of sockets.entries()) {
        const client = clients[at];
        if (client) {
          const steer = at === 0 ? Math.sin(frame / 30) : -Math.sin(frame / 41);
          client.predict(
            controlOf({
              brake: 0,
              kick: false,
              punch: false,
              steer,
              throttle: 1,
            })
          );
          const bytes = client.writeInputs(view);
          host.message(socket, buffer.slice(0, bytes));
        }
      }
      clock.advance(TICK_MS);
      for (const [at, socket] of sockets.entries()) {
        const client = clients[at];
        if (client) {
          followTicks(socket, client);
        }
      }
    }
    const status = host.status();
    expect(status.tick).toBeGreaterThanOrEqual(1199);
    expect(status.seats.map((seat) => seat.late)).toStrictEqual([0, 0]);
    expect(clients.map((client) => client?.stats.desyncs)).toStrictEqual([
      0, 0,
    ]);
    expect(clients[0]?.confirmed.tick).toBe(status.tick);
    expect(clients[1]?.confirmed.tick).toBe(status.tick);
  });

  it("tells each seat the same race and its own rider", () => {
    const clock = createClock();
    const host = createHost(clock);
    const sockets = [fakeSocket(), fakeSocket(), fakeSocket()];
    race(host, clock, sockets);
    const started = sockets.map(startedOf);
    expect(started.map((each) => each.you)).toStrictEqual([0, 1, 2]);
    expect(new Set(started.map((each) => each.seed)).size).toBe(1);
    expect(started.map((each) => each.seats)).toStrictEqual([3, 3, 3]);
    expect(new Set(started.map((each) => each.digest.join(","))).size).toBe(1);
  });

  it("refuses a late seat and a ninth seat", () => {
    const clock = createClock();
    const host = createHost(clock);
    const eight = Array.from({ length: 8 }, fakeSocket);
    for (const socket of eight) {
      host.seat(socket);
    }
    const ninth = fakeSocket();
    host.seat(ninth);
    expect(ninth.messages.at(-1)).toStrictEqual({
      kind: "refused",
      reason: "full",
    });
    const [first] = eight;
    if (first) {
      host.message(first, startPacket());
    }
    const late = fakeSocket();
    host.seat(late);
    expect(late.messages.at(-1)).toStrictEqual({
      kind: "refused",
      reason: "racing",
    });
  });

  it("steps at most four ticks in a wake and catches up over the next wakes", () => {
    const clock = createClock();
    const host = createHost(clock);
    const sockets = [fakeSocket()];
    race(host, clock, sockets);
    clock.advance(TICK_MS * 2);
    const before = host.status().tick;
    clock.stall(TICK_MS * 30);
    clock.wakeOnce();
    expect(host.status().tick - before).toBe(4);
    clock.wakeOnce();
    expect(host.status().tick - before).toBe(8);
    clock.advance(TICK_MS);
    expect(host.status().tick - before).toBeGreaterThanOrEqual(30);
    expect(host.status().worstBehindTicks).toBeGreaterThanOrEqual(30);
  });

  it("hands a dropped seat to the pilot and ends the race once every seat has gone", () => {
    const clock = createClock();
    const host = createHost(clock);
    const sockets = [fakeSocket(), fakeSocket()];
    race(host, clock, sockets);
    clock.advance(TICK_MS * 10);
    const [first, second] = sockets;
    if (!first || !second) {
      throw new Error("Two seats were asked for.");
    }
    second.ticks.length = 0;
    host.gone(second);
    clock.advance(TICK_MS * 10);
    expect(host.status().phase).toBe("racing");
    expect(second.ticks).toStrictEqual([]);
    expect(first.ticks.length).toBeGreaterThanOrEqual(19);
    host.gone(first);
    clock.advance(TICK_MS * 2);
    expect(clock.pending()).toBe(0);
    const again = fakeSocket();
    host.seat(again);
    expect(again.closed).toBeNull();
  });

  it("ends the race when its one seat, gone silent, is ridden home by the pilot", () => {
    const clock = createClock();
    const host = createHost(clock);
    const socket = fakeSocket();
    race(host, clock, [socket]);
    while (host.status().phase === "racing") {
      clock.advance(TICK_MS);
      socket.ticks.length = 0;
    }
    expect(socket.messages.at(-1)?.kind).toBe("ended");
    expect(socket.closed).toBe(SEAT_CLOSED);
    expect(clock.pending()).toBe(0);
  }, 60_000);

  it("answers a ping and ignores malformed packets", () => {
    const clock = createClock();
    const host = createHost(clock);
    const socket = fakeSocket();
    host.seat(socket);
    host.message(socket, new ArrayBuffer(0));
    host.message(socket, new Uint8Array([9, 9, 9]).buffer);
    host.message(socket, "not a packet");
    const buffer = new ArrayBuffer(PING_PACKET_BYTES);
    writePing(new DataView(buffer), 1234);
    host.message(socket, buffer);
    const pong = { stamp: 0, tick: 0 };
    const [answer] = socket.pongs;
    expect(answer && readPong(answer, pong)).toBeTruthy();
    expect(pong).toStrictEqual({ stamp: 1234, tick: 0 });
    expect(host.status().phase).toBe("waiting");
  });
});
