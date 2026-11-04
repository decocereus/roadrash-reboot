import { ROOM_FIELD_SIZE } from "@racer/career/room-race";
import { controlOf } from "@racer/sim/control";
import {
  inputBytes,
  MOST_BATCHED_CONTROLS,
  PING_PACKET_BYTES,
  readPong,
  writePing,
} from "@racer/sim/room-wire";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { SEAT_CLOSED, SEAT_SILENT } from "../src/messages.ts";
import {
  nearby,
  TICK_MS,
  START_DELAY_MS,
  createClock,
  fakeSocket,
  advanceHearing,
  pingPacket,
  startPacket,
  readyPacket,
  countdownsOn,
  pressedStart,
  startedOf,
  clientOf,
  race,
  seatOn,
  lobbyWithOneSeat,
  lobbyCounts,
  followTicks,
} from "./host-harness.ts";
import type { FakeSocket } from "./host-harness.ts";

describe("a room host", () => {
  it("fills its lobby toward the field and starts by itself at the deadline", () => {
    const { clock, host, messages, socket } = lobbyWithOneSeat();
    advanceHearing(host, clock, [socket], 60_000);
    const counts = lobbyCounts(messages);
    expect(counts[0]).toBe(1);
    expect(Math.max(...counts)).toBeGreaterThan(3);
    expect(host.status().phase).toBe("waiting");
    advanceHearing(host, clock, [socket], 60_000);
    const [last] = lobbyCounts(messages).toReversed();
    expect(last).toBe(ROOM_FIELD_SIZE);
    expect(host.status().phase).toBe("racing");
  });

  it("forgets a lobby that every seat left, so its old deadline starts nothing", () => {
    const { clock, host, socket } = lobbyWithOneSeat();
    host.gone(socket);
    clock.advance(60_000);
    const next = seatOn(host);
    clock.advance(60_001);
    expect(host.status().phase).toBe("waiting");
    expect(lobbyCounts(next.messages)[0]).toBe(1);
  });

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
              remount: false,
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

  describe("the start", () => {
    it("holds the countdown until the last seat has loaded", () => {
      const { clock, far, host, near } = pressedStart();
      host.message(near, readyPacket());
      clock.advance(10_000);
      expect(countdownsOn(near)).toBe(0);
      expect(host.status().tick).toBe(0);
      host.message(far, readyPacket());
      expect(countdownsOn(far)).toBe(1);
      clock.advance(START_DELAY_MS + 1000);
      expect(host.status().tick).toBeGreaterThan(50);
    });

    it("starts without a seat that never loads, at the deadline", () => {
      const { clock, far, host, near } = pressedStart();
      host.message(near, readyPacket());
      advanceHearing(host, clock, [far, near], 20_000);
      expect(countdownsOn(near)).toBe(1);
      clock.advance(START_DELAY_MS + 1000);
      expect(host.status().tick).toBeGreaterThan(50);
    });

    it("stops waiting for a seat that leaves while loading", () => {
      const { far, host, near } = pressedStart();
      host.message(near, readyPacket());
      host.gone(far);
      expect(countdownsOn(near)).toBe(1);
    });
  });

  it("tells every seat the humans' names in rider order", () => {
    const host = createHost(createClock());
    const first = fakeSocket();
    const second = fakeSocket();
    host.seat(first, "Ann", nearby);
    host.seat(second, "Bo", nearby);
    host.message(first, startPacket());
    expect(startedOf(first).names).toStrictEqual(["Ann", "Bo"]);
    expect(startedOf(second).names).toStrictEqual(["Ann", "Bo"]);
  });

  it("refuses a late seat and a ninth seat", () => {
    const clock = createClock();
    const host = createHost(clock);
    const eight = Array.from({ length: 8 }, fakeSocket);
    for (const socket of eight) {
      host.seat(socket, "Guest", nearby);
    }
    const ninth = fakeSocket();
    host.seat(ninth, "Guest", nearby);
    expect(ninth.messages.at(-1)).toStrictEqual({
      kind: "refused",
      reason: "full",
    });
    const [first] = eight;
    if (first) {
      host.message(first, startPacket());
    }
    const late = fakeSocket();
    host.seat(late, "Guest", nearby);
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
    clock.advance(120_000);
    expect(clock.pending()).toBe(0);
    const again = fakeSocket();
    host.seat(again, "Guest", nearby);
    expect(again.closed).toBeNull();
  });

  it("rides a seat home when it stopped riding but is still there", () => {
    const clock = createClock();
    const host = createHost(clock);
    const socket = fakeSocket();
    race(host, clock, [socket]);
    while (host.status().phase === "racing") {
      clock.advance(1000);
      host.message(socket, pingPacket());
      socket.ticks.length = 0;
      socket.pongs.length = 0;
    }
    expect(socket.messages.at(-1)?.kind).toBe("ended");
    expect(socket.closed).toBe(SEAT_CLOSED);
    clock.advance(1000);
    expect(clock.pending()).toBe(0);
  }, 60_000);

  it("drops a rider whose link died with no close, and the race rides on", () => {
    const clock = createClock();
    const host = createHost(clock);
    const lost = fakeSocket();
    const here = fakeSocket();
    race(host, clock, [lost, here]);
    for (let second = 0; second < 8; second += 1) {
      clock.advance(1000);
      host.message(lost, pingPacket());
      host.message(here, pingPacket());
    }
    const heardUntil = host.status().tick;
    for (let second = 0; second < 12; second += 1) {
      clock.advance(1000);
      host.message(here, pingPacket());
    }
    expect(lost.closed).toBe(SEAT_SILENT);
    expect(clock.notes.find((note) => note.kind === "left")).toMatchObject({
      kind: "left",
      seatsLeft: 1,
    });
    expect(host.status().phase).toBe("racing");
    expect(host.status().seats).toHaveLength(1);
    expect(host.status().tick).toBeGreaterThan(heardUntil);
  });

  it("writes a left line for a seat it could not send to", () => {
    const clock = createClock();
    const host = createHost(clock);
    const here = fakeSocket();
    const working = fakeSocket();
    let broken = false;
    const failing: FakeSocket = {
      ...working,
      send: (data) => {
        if (broken) {
          throw new RangeError("The socket has closed.");
        }
        working.send(data);
      },
    };
    race(host, clock, [failing, here]);
    broken = true;
    clock.advance(TICK_MS * 2);
    host.message(failing, pingPacket());
    host.message(here, pingPacket());
    clock.advance(1000);
    expect(clock.notes.find((note) => note.kind === "left")).toMatchObject({
      kind: "left",
      seatsLeft: 1,
    });
    expect(host.status().seats).toHaveLength(1);
  });

  it("ends the race and frees the room when every rider's link died", () => {
    const clock = createClock();
    const host = createHost(clock);
    const sockets = [fakeSocket(), fakeSocket()];
    race(host, clock, sockets);
    clock.advance(12_000);
    expect(host.status().phase).toBe("waiting");
    expect(clock.notes.filter((note) => note.kind === "left")).toHaveLength(2);
    expect(clock.notes.at(-1)?.kind).toBe("ended");
    clock.advance(120_000);
    expect(clock.pending()).toBe(0);
  });

  it("forgets a lobby rider whose link died, and tells the others", () => {
    const clock = createClock();
    const host = createHost(clock);
    const lost = fakeSocket();
    const here = fakeSocket();
    host.seat(lost, "Lost", nearby);
    host.seat(here, "Here", nearby);
    for (let second = 0; second < 12; second += 1) {
      clock.advance(1000);
      host.message(here, pingPacket());
    }
    expect(lost.closed).toBe(SEAT_SILENT);
    expect(host.status().names).toStrictEqual(["Here"]);
    expect(here.messages.at(-1)).toMatchObject({ names: ["Here"] });
  });

  it("answers a ping and ignores malformed packets", () => {
    const clock = createClock();
    const host = createHost(clock);
    const socket = fakeSocket();
    host.seat(socket, "Guest", nearby);
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
