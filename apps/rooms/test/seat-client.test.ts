import { coasting, controlOf } from "@racer/sim/control";
import { neutralInput } from "@racer/sim/race";
import { INPUT_HORIZON } from "@racer/sim/room";
import { clearFrame, createTickFrame } from "@racer/sim/room-frame";
import {
  PING_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  readRaceStats,
  writeTick,
} from "@racer/sim/room-wire";
import { riderIdAt, TICK_SECONDS } from "@racer/sim/state";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEAD_AFTER_MS, PING_EVERY_MS } from "../src/heartbeat.ts";
import { createInputLatency } from "../src/input-latency.ts";
import { encodeRoomMessage, SEAT_LEFT, SEAT_QUIT } from "../src/messages.ts";
import { createRoomRun } from "../src/room-run.ts";
import {
  MOST_CATCH_UP_MS_PER_FRAME,
  MOST_TICKS_PER_FRAME,
  openRoomSeat,
} from "../src/seat-client.ts";
import {
  BrowserTraceSchema,
  TRACE_ROW_FIELDS,
  TRACE_ROW_MS,
  TRACE_VERSION,
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
const HELD_TICKS = 300;
const DELAYED_TICKS = 30;
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
    vi.restoreAllMocks();
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
      JSON.stringify({ ...browser, rows: [], version: TRACE_VERSION }),
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

  it("spends one frame's share on held ticks and their replay, however many steps the frame takes", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    const flooring = controlOf({ ...neutralInput, throttle: 1 });
    for (let tick = 1; tick <= HELD_TICKS; tick += 1) {
      client?.predict(flooring);
    }
    seat.frameDrawn(0, 0);
    for (let tick = 1; tick <= HELD_TICKS - 10; tick += 1) {
      hearTick(socket, tick);
    }
    const workDone = () =>
      (client?.confirmed.tick ?? 0) + (client?.stats.resimulatedTicks ?? 0);
    const work = [workDone()];
    const step = () => {
      for (let due = seat.stepsDue(); due > 0; due -= 1) {
        client?.predict(flooring);
      }
    };
    for (let frame = 0; frame < 12; frame += 1) {
      const before = workDone();
      step();
      step();
      seat.frameDrawn(0, 0);
      work.push(workDone() - before);
    }
    expect(Math.max(...work)).toBe(MOST_TICKS_PER_FRAME);
    expect(client?.confirmed.tick).toBe(HELD_TICKS - 10);
    expect(client?.stats.resimulatedTicks).toBeGreaterThan(
      MOST_TICKS_PER_FRAME
    );
  });

  it.each([
    [0.5, MOST_CATCH_UP_MS_PER_FRAME / 0.5],
    [2, MOST_CATCH_UP_MS_PER_FRAME / 2],
  ])(
    "keeps a frame's catch-up to its time share, past the ticks that keep it up with the room, when each held tick takes %s ms to confirm",
    (tickMs, mostTicks) => {
      const { seat, socket } = loadingSeat();
      const client = seat.race()?.client;
      if (!client) {
        throw new Error("the seat has no race");
      }
      let nowMs = 0;
      vi.spyOn(performance, "now").mockImplementation(() => nowMs);
      const { confirm } = client;
      vi.spyOn(client, "confirm").mockImplementation((frame, hash) => {
        nowMs += tickMs;
        confirm(frame, hash);
      });
      seat.frameDrawn(0, 0);
      for (let tick = 1; tick <= HELD_TICKS; tick += 1) {
        hearTick(socket, tick);
      }
      const work: number[] = [];
      for (let frame = 0; frame < HELD_TICKS / 2; frame += 1) {
        const before = client.confirmed.tick;
        seat.stepsDue();
        seat.frameDrawn(0, 0);
        work.push(client.confirmed.tick - before);
      }
      expect(Math.max(...work)).toBe(mostTicks);
      expect(client.confirmed.tick).toBe(HELD_TICKS);
    }
  );

  it("still confirms the ticks a frame's length brings when each one costs more than the time share", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    if (!client) {
      throw new Error("the seat has no race");
    }
    let nowMs = 0;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    const { confirm } = client;
    vi.spyOn(client, "confirm").mockImplementation((frame, hash) => {
      nowMs += 2 * MOST_CATCH_UP_MS_PER_FRAME;
      confirm(frame, hash);
    });
    seat.frameDrawn(0, 0);
    for (let tick = 1; tick <= HELD_TICKS; tick += 1) {
      hearTick(socket, tick);
    }
    const work: number[] = [];
    for (let frame = 0; frame < 10; frame += 1) {
      nowMs += FRAME_MS;
      const before = client.confirmed.tick;
      seat.frameDrawn(0, 0);
      work.push(client.confirmed.tick - before);
    }
    expect(Math.min(...work.slice(1))).toBeGreaterThanOrEqual(
      Math.ceil(FRAME_MS / (1000 / 60))
    );
  });

  it("drains held ticks in frames that take no step, as when the race stops at its prediction limit", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    for (let tick = 1; tick <= INPUT_HORIZON; tick += 1) {
      client?.predict(coasting);
    }
    seat.frameDrawn(0, 0);
    for (let tick = 1; tick <= HELD_TICKS; tick += 1) {
      hearTick(socket, tick);
    }
    for (let frame = 0; frame < HELD_TICKS / MOST_TICKS_PER_FRAME; frame += 1) {
      vi.advanceTimersByTime(FRAME_MS);
      seat.frameDrawn(0, 0);
    }
    expect(client?.predicted.tick).toBe(INPUT_HORIZON);
    expect(client?.confirmed.tick).toBe(HELD_TICKS);
  });

  it("waits for a burst of held ticks to be caught up before it reports a finished rider", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    seat.frameDrawn(0, 0);
    for (let tick = 1; tick <= HELD_TICKS; tick += 1) {
      hearTick(socket, tick);
    }
    const reports = () =>
      socket.sentBytes.filter((bytes) => bytes === RACE_STATS_PACKET_BYTES)
        .length;
    const reported: number[] = [];
    for (let frame = 0; frame < 6; frame += 1) {
      seat.stepsDue();
      if (client) {
        client.mine.finishTick = 1;
      }
      seat.flush();
      seat.frameDrawn(0, 0);
      reported.push(reports());
    }
    expect(reported).toStrictEqual([0, 0, 0, 0, 1, 1]);
    expect(client?.confirmed.tick).toBe(HELD_TICKS);
  });

  it("works through held ticks a frame's share at a time once the race ends, then reports and hangs up", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    socket.hear(encodeRoomMessage({ kind: "countdown", startAtMs: 0 }));
    seat.frameDrawn(0, 0);
    for (let tick = 1; tick <= HELD_TICKS; tick += 1) {
      hearTick(socket, tick);
    }
    const confirmedAt = [client?.confirmed.tick ?? 0];
    socket.hear(encodeRoomMessage({ kind: "ended", tick: HELD_TICKS }));
    confirmedAt.push(client?.confirmed.tick ?? 0);
    const reportedAt: boolean[] = [];
    for (let frame = 0; frame < 8; frame += 1) {
      seat.frameDrawn(0, 0);
      confirmedAt.push(client?.confirmed.tick ?? 0);
      reportedAt.push(socket.closedWith !== null);
    }
    const steps = confirmedAt
      .slice(1)
      .map((at, frame) => at - (confirmedAt[frame] ?? 0));
    expect(Math.max(...steps)).toBeLessThanOrEqual(MOST_TICKS_PER_FRAME);
    expect({
      confirmed: client?.confirmed.tick,
      endedAfterCatchingUp: reportedAt.indexOf(true) > 0,
      reports: socket.sentBytes.filter(
        (bytes) => bytes === RACE_STATS_PACKET_BYTES
      ).length,
    }).toStrictEqual({
      confirmed: HELD_TICKS,
      endedAfterCatchingUp: true,
      reports: 1,
    });
  });

  it("replays a correction the room's last tick asked for a frame's share at a time once the race ends", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    socket.hear(encodeRoomMessage({ kind: "countdown", startAtMs: 0 }));
    seat.frameDrawn(0, 0);
    for (let tick = 0; tick < 2 * MOST_TICKS_PER_FRAME; tick += 1) {
      client?.predict(coasting);
    }
    const frame = createTickFrame();
    clearFrame(frame, 1);
    frame.controls.set(
      riderIdAt(0),
      controlOf({ ...neutralInput, throttle: 1 })
    );
    const view = new DataView(new ArrayBuffer(64));
    socket.hear(view.buffer.slice(0, writeTick(view, frame, null)));
    socket.hear(encodeRoomMessage({ kind: "ended", tick: 1 }));
    const replayedAt = [client?.stats.resimulatedTicks ?? 0];
    for (let drawn = 0; drawn < 4; drawn += 1) {
      seat.frameDrawn(0, 0);
      replayedAt.push(client?.stats.resimulatedTicks ?? 0);
    }
    expect(replayedAt[0]).toBeLessThanOrEqual(MOST_TICKS_PER_FRAME);
    expect(socket.closedWith).not.toBeNull();
  });

  it("confirms what it holds when the rider leaves, without counting that work as a drawn frame", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    client?.predict(coasting);
    vi.advanceTimersByTime(FRAME_MS);
    seat.frameDrawn(0, 0);
    vi.advanceTimersByTime(FRAME_MS);
    seat.frameDrawn(0, 0);
    for (let tick = 1; tick <= HELD_TICKS; tick += 1) {
      hearTick(socket, tick);
    }
    seat.leave();
    const [report] = socket.sentBuffers;
    const stats = report && readRaceStats(new DataView(report));
    expect(client?.confirmed.tick).toBe(HELD_TICKS);
    expect(stats?.mostReplayedTicks).toBeLessThanOrEqual(MOST_TICKS_PER_FRAME);
  });

  it("reports how far ahead its controls were sent, also once the delay it asks for falls back", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    client?.predict(coasting, DELAYED_TICKS);
    client?.predict(coasting, 0);
    for (let frame = 0; frame < 2; frame += 1) {
      vi.advanceTimersByTime(FRAME_MS);
      seat.frameDrawn(0, 0);
    }
    seat.leave();
    const [report] = socket.sentBuffers;
    const stats = report && readRaceStats(new DataView(report));
    expect(stats?.inputDelayWorstMs).toBe(
      Math.round((DELAYED_TICKS - 1) * TICK_SECONDS * 1000)
    );
  });

  it("confirms every tick as it arrives while the page is hidden", () => {
    const { seat, socket } = loadingSeat();
    const client = seat.race()?.client;
    seat.frameDrawn(0, 0);
    seat.stoppedDrawing();
    for (let tick = 1; tick <= 3 * MOST_TICKS_PER_FRAME; tick += 1) {
      hearTick(socket, tick);
    }
    expect(client?.confirmed.tick).toBe(3 * MOST_TICKS_PER_FRAME);
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
