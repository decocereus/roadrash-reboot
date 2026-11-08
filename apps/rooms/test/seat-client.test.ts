import { coasting, controlOf } from "@racer/sim/control";
import { neutralInput } from "@racer/sim/race";
import { MOST_TICKS_PER_SETTLE } from "@racer/sim/room-client";
import { clearFrame, createTickFrame } from "@racer/sim/room-frame";
import {
  PING_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  readRaceStats,
  writeTick,
} from "@racer/sim/room-wire";
import { riderIdAt } from "@racer/sim/state";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEAD_AFTER_MS, PING_EVERY_MS } from "../src/heartbeat.ts";
import { createInputLatency } from "../src/input-latency.ts";
import { encodeRoomMessage, SEAT_LEFT, SEAT_QUIT } from "../src/messages.ts";
import { createRoomRun } from "../src/room-run.ts";
import { openRoomSeat } from "../src/seat-client.ts";
import {
  BrowserTraceSchema,
  TRACE_ROW_FIELDS,
  TRACE_ROW_MS,
  TraceField,
} from "../src/tape.ts";
import {
  countdown,
  FakeSocket,
  hearTick,
  loadingSeat,
  newSeat,
  raceDataSwitch,
} from "./seat-socket.ts";

const LONGEST_LOAD_MS = 20_000;
const FRAME_MS = 50;
const browser = {
  build: "abc",
  gpu: "Test GPU",
  graphics: "quality rung 1",
};

const decodeTrace = Schema.decodeUnknownSync(
  Schema.fromJsonString(BrowserTraceSchema)
);

const rowsOf = (text: string | undefined): readonly (readonly number[])[] => {
  const { rows } = decodeTrace(text);
  return Array.from({ length: rows.length / TRACE_ROW_FIELDS }, (_, row) =>
    rows.slice(row * TRACE_ROW_FIELDS, (row + 1) * TRACE_ROW_FIELDS)
  );
};

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
      null
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
      null
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
    const { seat, socket } = loadingSeat(raceDataSwitch(browser, true).trace);
    seat.leave();
    seat.leave();
    expect(socket.sentText).toStrictEqual([
      JSON.stringify({ ...browser, rows: [] }),
    ]);
    FakeSocket.opened = [];
    const { seat: off, socket: quiet } = loadingSeat(
      raceDataSwitch(browser, false).trace
    );
    off.leave();
    expect(quiet.sentText).toStrictEqual([]);
  });

  it("sends the timeline from before Race data went off once, then only what it rode after it came back on", () => {
    const raceData = raceDataSwitch(browser, true);
    const { seat, socket } = loadingSeat(raceData.trace);
    socket.hear(countdown);
    seat.race()?.client.predict(coasting);
    let tick = 0;
    const ride = (ms: number): void => {
      for (let ridden = 0; ridden < ms; ridden += FRAME_MS) {
        vi.advanceTimersByTime(FRAME_MS);
        tick += 1;
        hearTick(socket, tick);
        seat.frameDrawn(0, 0);
      }
    };
    const startedAt = performance.now();
    ride(1000);
    raceData.turn(false);
    const offAt = performance.now() - startedAt;
    expect(socket.sentText).toHaveLength(1);
    const before = rowsOf(socket.sentText[0]);
    ride(1000);
    raceData.turn(true);
    const onAt = performance.now() - startedAt;
    ride(1000);
    seat.leave();
    expect(socket.sentText).toHaveLength(2);
    const after = rowsOf(socket.sentText[1]);
    expect({
      afterOn:
        after.length > 0 &&
        after.every((row) => (row[TraceField.atMs] ?? 0) > onAt),
      beforeOff: before.every((row) => (row[TraceField.atMs] ?? 0) <= offAt),
      beforeRows: before.length,
      worstGapAfter: Math.max(
        ...after.map((row) => row[TraceField.worstTickGapMs] ?? 0)
      ),
    }).toStrictEqual({
      afterOn: true,
      beforeOff: true,
      beforeRows: 1000 / TRACE_ROW_MS,
      worstGapAfter: FRAME_MS,
    });
  });

  it("stops following the Race data switch once its seat is done", () => {
    const raceData = raceDataSwitch(browser, true);
    const { seat } = loadingSeat(raceData.trace);
    seat.leave();
    expect(raceData.watched()).toBeFalsy();
  });

  it("confirms a burst of held ticks a frame's share at a time, and all of it within a few frames", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    seat.stepsDue();
    for (let tick = 1; tick <= 5 * MOST_TICKS_PER_SETTLE - 10; tick += 1) {
      hearTick(socket, tick);
    }
    const confirmedThrough = [client?.confirmed.tick];
    for (let frame = 0; frame < 5; frame += 1) {
      seat.stepsDue();
      confirmedThrough.push(client?.confirmed.tick);
    }
    expect(confirmedThrough).toStrictEqual(
      [1, 1, 2, 3, 4, 5].map((share) =>
        Math.min(5 * MOST_TICKS_PER_SETTLE - 10, share * MOST_TICKS_PER_SETTLE)
      )
    );
  });

  it("confirms every tick as it arrives while the page draws no frames", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    seat.stepsDue();
    vi.advanceTimersByTime(1000);
    for (let tick = 1; tick <= 3 * MOST_TICKS_PER_SETTLE; tick += 1) {
      hearTick(socket, tick);
    }
    expect(client?.confirmed.tick).toBe(3 * MOST_TICKS_PER_SETTLE);
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
    const { seat, socket } = loadingSeat(raceDataSwitch(browser, true).trace);
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
      null
    );
    seat.leave();
    expect(FakeSocket.opened[0]?.sentBytes).toStrictEqual([]);
  });

  it("tells the room a Leave from quitting the race by its close code", () => {
    const { seat: leaving, socket: left } = newSeat();
    leaving.leaveRoom();
    const { seat: hanging, socket: hungUp } = newSeat();
    hanging.leave();
    expect([left.closedWith, hungUp.closedWith]).toStrictEqual([
      SEAT_LEFT,
      SEAT_QUIT,
    ]);
  });

  it("tells the lobby once the room took the seat and its rejoin choice", () => {
    const seat = openRoomSeat(
      "http://rooms.test",
      "friday-ride",
      "Near",
      "test-build",
      "member-key",
      null,
      false
    );
    const opened = vi.fn<() => void>();
    seat.listen({ onOpen: opened });
    expect(opened).not.toHaveBeenCalled();
    FakeSocket.opened.at(-1)?.open();
    expect(opened).toHaveBeenCalledOnce();
    seat.leave();
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
