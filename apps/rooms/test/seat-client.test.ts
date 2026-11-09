import { seatedRace } from "@racer/career/room-race";
import { coasting, controlOf } from "@racer/sim/control";
import { neutralInput } from "@racer/sim/race";
import { createRoom } from "@racer/sim/room";
import { clearFrame, createTickFrame } from "@racer/sim/room-frame";
import {
  PING_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  readRaceStats,
  writeRaceSnapshot,
  writeTick,
} from "@racer/sim/room-wire";
import { snapshotCapacity, writeSnapshot } from "@racer/sim/snapshot";
import { riderIdAt } from "@racer/sim/state";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEAD_AFTER_MS, PING_EVERY_MS } from "../src/heartbeat.ts";
import { createInputLatency } from "../src/input-latency.ts";
import { encodeRoomMessage, SEAT_LEFT, SEAT_QUIT } from "../src/messages.ts";
import { ticksOf } from "../src/room-config.ts";
import { CHECKPOINT_TICKS } from "../src/room-memory.ts";
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
  pongTo,
  raceDataSwitch,
  startedMessage,
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

  it("catches up from the room's snapshot, then follows the ticks after it", () => {
    const { seat, socket } = loadingSeat();
    const { manifest } = startedMessage;
    const { setup } = seatedRace(manifest.seed, 1, manifest.rule);
    const room = createRoom(setup, ticksOf(manifest.raceLimitSeconds));
    for (let tick = 1; tick <= CHECKPOINT_TICKS; tick += 1) {
      room.accept(riderIdAt(0), tick, [coasting]);
      room.step();
    }
    const snapshot = new Uint8Array(snapshotCapacity(room.state));
    writeSnapshot(room.state, room.digest, new DataView(snapshot.buffer));
    const packet = writeRaceSnapshot(snapshot);
    const heard = new ArrayBuffer(packet.byteLength);
    new Uint8Array(heard).set(packet);
    socket.hear(heard);
    const race = seat.race();
    expect(race?.client.confirmed.tick).toBe(CHECKPOINT_TICKS);
    expect(race?.client.predicted.tick).toBe(CHECKPOINT_TICKS);
    hearTick(socket, CHECKPOINT_TICKS + 1);
    expect(race?.client.confirmed.tick).toBe(CHECKPOINT_TICKS + 1);
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
        seat.frameDrawn();
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

  it("tells the room, in its next ping, the round trip it measured on the last one", () => {
    const { seat, socket } = newSeat();
    socket.answers = false;
    vi.advanceTimersByTime(PING_EVERY_MS);
    const [first] = socket.sentPings;
    if (!first) {
      throw new Error("The seat sent no ping.");
    }
    vi.advanceTimersByTime(120);
    socket.hear(pongTo(first));
    vi.advanceTimersByTime(PING_EVERY_MS - 120);
    expect(socket.sentPings.map(({ rttMs }) => rttMs)).toStrictEqual([
      null,
      120,
    ]);
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
