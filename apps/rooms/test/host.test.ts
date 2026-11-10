import { ROOM_FIELD_SIZE, seatedRace } from "@racer/career/room-race";
import { STARTING_BIKE } from "@racer/career/tables";
import { controlOf } from "@racer/sim/control";
import { createRoomClient } from "@racer/sim/room-client";
import {
  inputBytes,
  MOST_BATCHED_CONTROLS,
  PING_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  READY_PACKET_BYTES,
  readPong,
  ROOM_PROTOCOL,
  writePing,
  writeRaceStats,
  writeReady,
} from "@racer/sim/room-wire";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { setupDigest, trackDigest } from "@racer/sim/snapshot-setup";
import { riderIdAt } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { humanNames, seatedCount } from "../src/manifest.ts";
import { SEAT_CLOSED, SEAT_SILENT } from "../src/messages.ts";
import { ticksOf } from "../src/room-config.ts";
import { TRACE_VERSION } from "../src/tape.ts";
import {
  nearby,
  sameBuild,
  TICK_MS,
  START_DELAY_MS,
  createClock,
  fakeSocket,
  advanceHearing,
  pingPacket,
  someRaceStats,
  readyPacket,
  countdownsOn,
  loadingRace,
  startedOf,
  clientOf,
  race,
  lastLobby,
  readyAll,
  followTicks,
  HOLD_MS,
} from "./host-harness.ts";
import type { FakeSocket } from "./host-harness.ts";

const announcedStarts = (socket: FakeSocket): readonly number[] =>
  socket.messages.flatMap((message) =>
    message.kind === "countdown" ? [message.startAtMs] : []
  );

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
    expect(new Set(started.map((each) => each.manifest.seed)).size).toBe(1);
    expect(started.map((each) => seatedCount(each.manifest))).toStrictEqual([
      3, 3, 3,
    ]);
    expect(
      new Set(started.map((each) => each.manifest.contentHash.join(","))).size
    ).toBe(1);
  });

  describe("the start", () => {
    it("holds the countdown until the last seat has loaded", () => {
      const { clock, far, host, near } = loadingRace();
      host.message(near, readyPacket(near));
      clock.advance(10_000);
      expect(countdownsOn(near)).toBe(0);
      expect(host.status().tick).toBe(0);
      host.message(far, readyPacket(far));
      expect(countdownsOn(far)).toBe(1);
      clock.advance(START_DELAY_MS + 1000);
      expect(host.status().tick).toBeGreaterThan(50);
    });

    it("starts without a seat that never loads, at the deadline", () => {
      const { clock, far, host, near } = loadingRace();
      host.message(near, readyPacket(near));
      advanceHearing(host, clock, [far, near], 20_000);
      expect(countdownsOn(near)).toBe(1);
      clock.advance(START_DELAY_MS + 1000);
      expect(host.status().tick).toBeGreaterThan(50);
    });

    it("stops waiting for a seat that leaves while loading", () => {
      const { far, host, near } = loadingRace();
      host.message(near, readyPacket(near));
      host.gone(far, 1000);
      expect(countdownsOn(near)).toBe(1);
    });
  });

  it("tells every seat the humans' names in rider order", () => {
    const clock = createClock();
    const host = createHost(clock);
    const first = fakeSocket();
    const second = fakeSocket();
    host.seat(first, "Ann", nearby, sameBuild());
    host.seat(second, "Bo", nearby, sameBuild());
    readyAll(host, [first, second]);
    expect(humanNames(startedOf(first).manifest)).toStrictEqual(["Ann", "Bo"]);
    expect(humanNames(startedOf(second).manifest)).toStrictEqual(["Ann", "Bo"]);
  });

  it("starts no race from a packet, only from its riders being ready", () => {
    const clock = createClock();
    const host = createHost(clock);
    const socket = fakeSocket();
    host.seat(socket, "Guest", nearby, sameBuild());
    host.message(socket, new Uint8Array([5]).buffer);
    advanceHearing(host, clock, [socket], 180_000);
    expect(host.status().phase).toBe("waiting");
    readyAll(host, [socket]);
    expect(host.status().phase).toBe("racing");
  });

  it.each([
    [
      "another build",
      { build: "old-build", key: "k", protocol: ROOM_PROTOCOL, rejoin: true },
    ],
    [
      "another protocol",
      {
        build: "test-build",
        key: "k",
        protocol: ROOM_PROTOCOL + 1,
        rejoin: true,
      },
    ],
    ["no claim", { build: "", key: "k", protocol: 0, rejoin: true }],
  ])("refuses a seat with %s before it sits", (_case, claim) => {
    const clock = createClock();
    const host = createHost(clock);
    const stale = fakeSocket();
    host.seat(stale, "Guest", nearby, claim);
    expect(stale.messages).toStrictEqual([
      { kind: "refused", reason: "build" },
    ]);
    expect(host.status().waiting).toBe(0);
    expect(clock.notes.at(-1)).toStrictEqual({
      kind: "refused",
      reason: "build",
    });
  });

  it("freezes one manifest for every seat, built from the same race", () => {
    const { far, near } = loadingRace();
    const { manifest } = startedOf(near);
    expect(startedOf(far).manifest).toStrictEqual(manifest);
    const { setup } = seatedRace(
      manifest.seed,
      seatedCount(manifest),
      manifest.rule
    );
    const { confirmed } = createRoomClient(
      setup,
      riderIdAt(0),
      ticksOf(manifest.raceLimitSeconds)
    );
    expect(manifest.contentHash).toStrictEqual([
      ...setupDigest(confirmed, setup.track),
    ]);
    expect(manifest.trackHash).toStrictEqual([...trackDigest(setup.track)]);
    expect(manifest).toMatchObject({
      build: "test-build",
      protocol: ROOM_PROTOCOL,
      reconnect: { holdSeconds: 30 },
      rule: { roadId: setup.roadId, tier: 2 },
      tickRate: 60,
    });
  });

  it("lists every rider in the manifest, with AI labelled as AI", () => {
    const { near } = loadingRace();
    const { roster } = startedOf(near).manifest;
    const humans = roster.filter((entry) => entry.kind === "human");
    const ai = roster.filter((entry) => entry.kind === "ai");
    expect(humans.map((entry) => [entry.name, entry.bikeId])).toStrictEqual([
      ["Near", STARTING_BIKE],
      ["Far", STARTING_BIKE],
    ]);
    expect(ai.map((entry) => entry.name)).toStrictEqual(
      Array.from({ length: ROOM_FIELD_SIZE - 2 }, () => null)
    );
  });

  it("gives each person a colour for the race and the AI none", () => {
    const { near } = loadingRace();
    const { roster } = startedOf(near).manifest;
    expect(
      roster.flatMap((entry) => (entry.kind === "human" ? [entry.colour] : []))
    ).toStrictEqual([0, 1]);
    expect(
      roster.every((entry) => entry.kind === "human" || entry.colour === null)
    ).toBeTruthy();
  });

  it("drops a seat whose loaded race does not match, and starts without it", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    const wrong = new ArrayBuffer(READY_PACKET_BYTES);
    writeReady(new DataView(wrong), new Uint32Array(HASH_WORDS));
    host.message(far, wrong);
    expect(far.messages.at(-1)).toStrictEqual({
      kind: "refused",
      reason: "content",
    });
    expect(host.status().waiting).toBe(1);
    expect(countdownsOn(near)).toBe(1);
    expect(clock.notes.some((note) => note.kind === "left")).toBeTruthy();
  });

  it("announces one start moment on its own clock, and rides from it", () => {
    const { clock, far, host, near } = loadingRace();
    const pongTime = (): number => {
      const before = near.pongs.length;
      host.message(near, pingPacket());
      const pong = { roomMs: 0, stamp: 0 };
      const answer = near.pongs[before];
      expect(answer && readPong(answer, pong)).toBeTruthy();
      return pong.roomMs;
    };
    host.message(near, readyPacket(near));
    host.message(far, readyPacket(far));
    const [startAtMs] = announcedStarts(near);
    expect(announcedStarts(far)).toStrictEqual([startAtMs]);
    expect(startAtMs).toBe(pongTime() + START_DELAY_MS);
    clock.advance(START_DELAY_MS - 1);
    expect(host.status().tick).toBe(0);
    clock.advance(1000 + 1);
    expect(host.status().tick).toBeGreaterThan(55);
  });

  it("refuses a ninth member", () => {
    const clock = createClock();
    const host = createHost(clock);
    for (const socket of Array.from({ length: 8 }, fakeSocket)) {
      host.seat(socket, "Guest", nearby, sameBuild());
    }
    const ninth = fakeSocket();
    host.seat(ninth, "Guest", nearby, sameBuild());
    expect(ninth.messages.at(-1)).toStrictEqual({
      kind: "refused",
      reason: "full",
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
    host.gone(second, 1000);
    clock.advance(TICK_MS * 10);
    expect(host.status().phase).toBe("racing");
    expect(second.ticks).toStrictEqual([]);
    expect(first.ticks.length).toBeGreaterThanOrEqual(19);
    host.gone(first, 1000);
    clock.advance(240_000);
    expect(clock.pending()).toBe(0);
    const again = fakeSocket();
    host.seat(again, "Guest", nearby, sameBuild());
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
    expect(socket.closed).toBeNull();
    expect(host.status()).toMatchObject({
      hostPhase: "waiting",
      raceId: null,
      seats: [],
      tick: 0,
    });
    const stats = new ArrayBuffer(RACE_STATS_PACKET_BYTES);
    writeRaceStats(new DataView(stats), someRaceStats);
    host.message(socket, stats);
    host.message(
      socket,
      JSON.stringify({
        build: "abc",
        gpu: "g",
        graphics: "q",
        rows: [],
        version: TRACE_VERSION,
      })
    );
    clock.advance(6000);
    expect({
      closed: socket.closed,
      kinds: clock.notes
        .map(({ kind }) => kind)
        .filter((kind) => kind === "stats" || kind === "browser"),
      traced: clock.tape.has("tapes/race-1/rider-0.trace.json"),
    }).toStrictEqual({
      closed: SEAT_CLOSED,
      kinds: ["stats", "browser"],
      traced: true,
    });
  }, 60_000);

  it("holds the bike of a rider whose link died with no close, and the race rides on", () => {
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
    expect(clock.notes.find((note) => note.kind === "held")).toMatchObject({
      closeCode: SEAT_SILENT,
      rider: 0,
    });
    expect(host.status().phase).toBe("racing");
    expect(host.status().seats).toHaveLength(1);
    expect(host.status().tick).toBeGreaterThan(heardUntil);
  });

  it("holds the bike of a seat it could not send to", () => {
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
    expect(clock.notes.find((note) => note.kind === "held")).toMatchObject({
      closeCode: null,
    });
    expect(host.status().seats).toHaveLength(1);
  });

  it("ends the race and frees the room when every rider's link died", () => {
    const clock = createClock();
    const host = createHost(clock);
    const sockets = [fakeSocket(), fakeSocket()];
    race(host, clock, sockets);
    clock.advance(12_000);
    expect(host.status().phase).toBe("racing");
    clock.advance(HOLD_MS);
    expect(host.status().phase).toBe("waiting");
    expect(clock.notes.filter((note) => note.kind === "left")).toHaveLength(2);
    expect(clock.notes.at(-1)?.kind).toBe("ended");
    clock.advance(120_000);
    expect(clock.pending()).toBe(0);
  });

  it("marks a lobby rider whose link died as away, and tells the others", () => {
    const clock = createClock();
    const host = createHost(clock);
    const lost = fakeSocket();
    const here = fakeSocket();
    host.seat(lost, "Lost", nearby, sameBuild());
    host.seat(here, "Here", nearby, sameBuild());
    host.message(lost, pingPacket());
    for (let second = 0; second < 12; second += 1) {
      clock.advance(1000);
      host.message(here, pingPacket());
    }
    expect(lost.closed).toBe(SEAT_SILENT);
    expect(host.status().names).toStrictEqual(["Here"]);
    expect(lastLobby(here).members.map((member) => member.here)).toStrictEqual([
      false,
      true,
    ]);
  });

  it("answers a ping and ignores malformed packets", () => {
    const clock = createClock();
    const host = createHost(clock);
    const socket = fakeSocket();
    host.seat(socket, "Guest", nearby, sameBuild());
    host.message(socket, new ArrayBuffer(0));
    host.message(socket, new Uint8Array([9, 9, 9]).buffer);
    host.message(socket, "not a packet");
    const buffer = new ArrayBuffer(PING_PACKET_BYTES);
    writePing(new DataView(buffer), 1234, null);
    host.message(socket, buffer);
    const pong = { roomMs: 0, stamp: 0 };
    const [answer] = socket.pongs;
    expect(answer && readPong(answer, pong)).toBeTruthy();
    expect(pong).toStrictEqual({ roomMs: 0, stamp: 1234 });
    expect(host.status().phase).toBe("waiting");
  });
});
