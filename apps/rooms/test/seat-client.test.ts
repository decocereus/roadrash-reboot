import { coasting, controlOf } from "@racer/sim/control";
import { neutralInput } from "@racer/sim/race";
import { clearFrame, createTickFrame } from "@racer/sim/room-frame";
import {
  PING_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  readRaceStats,
  writeTick,
} from "@racer/sim/room-wire";
import { riderIdAt } from "@racer/sim/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInputLatency } from "../src/input-latency.ts";
import { encodeRoomMessage, SEAT_CLOSED, SEAT_LEFT } from "../src/messages.ts";
import { createRoomRun } from "../src/room-run.ts";
import { openRoomSeat } from "../src/seat-client.ts";
import {
  DEAD_AFTER_MS,
  FakeSocket,
  loadingSeat,
  newSeat,
  PING_EVERY_MS,
} from "./seat-socket.ts";

const LONGEST_LOAD_MS = 20_000;

describe("a seat loading the race", () => {
  beforeEach(() => {
    FakeSocket.opened = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stays down when another tab takes its place in the lobby", () => {
    const seat = openRoomSeat(
      "http://rooms.test",
      "friday-ride",
      "Near",
      "test-build",
      "member-key",
      () => null
    );
    FakeSocket.opened[0]?.hear(
      encodeRoomMessage({ kind: "refused", reason: "replaced" })
    );
    expect(seat.phase()).toBe("refused");
    expect(seat.refusal()).toBe("replaced");
  });

  it("remembers a walk it heard before anything asked for it", () => {
    const seat = openRoomSeat(
      "http://rooms.test",
      "friday-ride",
      "Near",
      "test-build",
      "member-key",
      () => null
    );
    const walk = {
      heading: 1,
      lean: 0,
      pace: 0,
      place: "foot",
      pose: null,
      x: 2,
      z: 3,
    } as const;
    FakeSocket.opened[0]?.hear(
      encodeRoomMessage({ ...walk, kind: "walk", member: "far" })
    );
    expect(seat.walkOf("far")).toMatchObject(walk);
    expect(seat.walkOf("nobody")).toBeUndefined();
  });

  it("is lost when another tab takes its place during a race", () => {
    const { seat, socket } = loadingSeat();
    socket.hear(encodeRoomMessage({ kind: "refused", reason: "replaced" }));
    expect(seat.phase()).toBe("lost");
  });

  it("sends its browser trace once with the stats, and none with Race data off", () => {
    const browser = {
      build: "abc",
      gpu: "Test GPU",
      graphics: "quality rung 1",
    };
    const { seat, socket } = loadingSeat(() => browser);
    seat.leave();
    seat.leave();
    expect(socket.sentText).toStrictEqual([
      JSON.stringify({ ...browser, rows: [] }),
    ]);
    FakeSocket.opened = [];
    const { seat: off, socket: quiet } = loadingSeat();
    off.leave();
    expect(quiet.sentText).toStrictEqual([]);
  });

  it("counts a correction it had not yet replayed in its last report", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    client?.predict(coasting);
    client?.predict(coasting);
    const frame = createTickFrame();
    clearFrame(frame, 1);
    frame.controls.set(
      riderIdAt(0),
      controlOf({ ...neutralInput, throttle: 1 })
    );
    const view = new DataView(new ArrayBuffer(64));
    const bytes = writeTick(view, frame, null);
    socket.hear(view.buffer.slice(0, bytes));
    seat.leave();
    const [report] = socket.sentBuffers;
    expect(report && readRaceStats(new DataView(report))?.rollbacks).toBe(1);
  });

  it("tells the results screen the rider's own colour", () => {
    const { seat } = loadingSeat();
    const race = seat.race();
    if (!race) {
      throw new Error("The seat has no race.");
    }
    const run = createRoomRun(
      seat,
      race,
      "friday-ride",
      createInputLatency(
        () => 0,
        (done) => {
          done();
        }
      )
    );
    expect(run.report().myColour).toBe(0);
  });

  it("counts a correction it had not yet replayed on the results screen", () => {
    const { seat, socket } = loadingSeat();
    const race = seat.race();
    if (!race) {
      throw new Error("The seat has no race.");
    }
    const run = createRoomRun(
      seat,
      race,
      "friday-ride",
      createInputLatency(
        () => 0,
        (done) => {
          done();
        }
      )
    );
    race.client.predict(coasting);
    race.client.predict(coasting);
    const frame = createTickFrame();
    clearFrame(frame, 1);
    frame.controls.set(
      riderIdAt(0),
      controlOf({ ...neutralInput, throttle: 1 })
    );
    const view = new DataView(new ArrayBuffer(64));
    const bytes = writeTick(view, frame, null);
    socket.hear(view.buffer.slice(0, bytes));
    expect(run.report().net.rollbacks).toBe(1);
  });

  it("sends its stats and finished rows every 15 s while it rides, so a dead socket loses little", () => {
    const browser = {
      build: "abc",
      gpu: "Test GPU",
      graphics: "quality rung 1",
    };
    const { seat, socket } = loadingSeat(() => browser);
    socket.hear(encodeRoomMessage({ kind: "countdown", startAtMs: 0 }));
    const frame = createTickFrame();
    const view = new DataView(new ArrayBuffer(64));
    for (let tick = 1; tick <= 30; tick += 1) {
      clearFrame(frame, tick);
      frame.controls.set(riderIdAt(0), coasting);
      const bytes = writeTick(view, frame, null);
      socket.hear(view.buffer.slice(0, bytes));
      vi.advanceTimersByTime(1000);
    }
    expect(seat.phase()).toBe("racing");
    expect(socket.sentText).toHaveLength(2);
    expect(
      socket.sentBytes.filter((bytes) => bytes === RACE_STATS_PACKET_BYTES)
    ).toHaveLength(2);
  });

  it("sends the room its race stats once when it leaves", () => {
    const { seat, socket } = loadingSeat();
    seat.leave();
    seat.leave();
    const stats = socket.sentBytes.filter(
      (bytes) => bytes === RACE_STATS_PACKET_BYTES
    );
    expect(stats).toHaveLength(1);
  });

  it("has no stats to send from a lobby", () => {
    const seat = openRoomSeat(
      "http://rooms.test",
      "friday-ride",
      "Near",
      "test-build",
      "member-key",
      () => null
    );
    seat.leave();
    expect(FakeSocket.opened[0]?.sentBytes).toStrictEqual([]);
  });

  it("tells the room a Leave from a hang-up by its close code", () => {
    const { seat: leaving, socket: left } = newSeat();
    leaving.leaveRoom();
    const { seat: hanging, socket: hungUp } = newSeat();
    hanging.leave();
    expect([left.closedWith, hungUp.closedWith]).toStrictEqual([
      SEAT_LEFT,
      SEAT_CLOSED,
    ]);
  });

  it("pings the room from the lobby, so the room can tell it is still there", () => {
    const { seat, socket } = newSeat();
    vi.advanceTimersByTime(PING_EVERY_MS);
    expect(socket.sentBytes).toStrictEqual([PING_PACKET_BYTES]);
    seat.leave();
  });

  it("waits as long as the room answers its pings", () => {
    const { seat } = loadingSeat();
    vi.advanceTimersByTime(LONGEST_LOAD_MS);
    expect(seat.phase()).toBe("loading");
    seat.leave();
  });

  it("is lost once its pings go unanswered", () => {
    const { seat, socket } = loadingSeat();
    socket.answers = false;
    vi.advanceTimersByTime(DEAD_AFTER_MS);
    expect(seat.phase()).toBe("loading");
    vi.advanceTimersByTime(2 * PING_EVERY_MS);
    expect(seat.phase()).toBe("lost");
  });
});
