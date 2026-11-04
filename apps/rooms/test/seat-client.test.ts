import { publicRoomRule } from "@racer/career/room-race";
import { STARTING_BIKE } from "@racer/career/tables";
import { coasting, controlOf } from "@racer/sim/control";
import { neutralInput } from "@racer/sim/race";
import { clearFrame, createTickFrame } from "@racer/sim/room-frame";
import {
  PING_PACKET_BYTES,
  PONG_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  readPing,
  readRaceStats,
  ROOM_PROTOCOL,
  writePong,
  writeTick,
} from "@racer/sim/room-wire";
import { riderIdAt } from "@racer/sim/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInputLatency } from "../src/input-latency.ts";
import { encodeRoomMessage } from "../src/messages.ts";
import { createRoomRun } from "../src/room-run.ts";
import { openRoomSeat } from "../src/seat-client.ts";
import type { SeatBrowser } from "../src/tape.ts";

const LONGEST_LOAD_MS = 20_000;
const DEAD_AFTER_MS = 5000;
const PING_EVERY_MS = 500;

interface SocketEvent {
  readonly code?: number;
  readonly data?: string | ArrayBuffer;
}

class FakeSocket {
  static readonly OPEN = 1;

  static opened: FakeSocket[] = [];

  readonly readyState = FakeSocket.OPEN;

  readonly sentBytes: number[] = [];

  readonly sentBuffers: ArrayBuffer[] = [];

  readonly sentText: string[] = [];

  binaryType = "blob";

  answers = true;

  private readonly heard = new Map<string, (event: SocketEvent) => void>();

  constructor() {
    FakeSocket.opened.push(this);
  }

  addEventListener(kind: string, listen: (event: SocketEvent) => void): void {
    this.heard.set(kind, listen);
  }

  close(code: number): void {
    this.heard.get("close")?.({ code });
  }

  open(): void {
    this.heard.get("open")?.({});
  }

  hear(data: string | ArrayBuffer): void {
    this.heard.get("message")?.({ data });
  }

  send(data: string | Uint8Array | ArrayBuffer): void {
    if (!(data instanceof Uint8Array || data instanceof ArrayBuffer)) {
      this.sentText.push(data);
      return;
    }
    this.sentBytes.push(data.byteLength);
    if (!(data instanceof Uint8Array)) {
      this.sentBuffers.push(data);
      return;
    }
    if (!this.answers || data.byteLength !== PING_PACKET_BYTES) {
      return;
    }
    const stamp = readPing(
      new DataView(data.buffer, data.byteOffset, data.byteLength)
    );
    const buffer = new ArrayBuffer(PONG_PACKET_BYTES);
    writePong(new DataView(buffer), stamp, 0);
    this.hear(buffer);
  }
}

const loadingSeat = (browser: () => SeatBrowser | null = () => null) => {
  const seat = openRoomSeat(
    "http://rooms.test",
    "friday-ride",
    "Near",
    "test-build",
    "member-key",
    browser
  );
  const [socket] = FakeSocket.opened;
  socket?.open();
  socket?.hear(
    encodeRoomMessage({
      kind: "started",
      manifest: {
        build: "test-build",
        contentHash: [0],
        loadingDeadlineMs: 20_000,
        protocol: ROOM_PROTOCOL,
        raceId: "race-1",
        reconnect: "none",
        roster: [
          { bikeId: STARTING_BIKE, kind: "human", name: "Near", rider: 0 },
        ],
        rule: publicRoomRule,
        seed: 1,
        tickRate: 60,
        trackHash: [0],
      },
      you: 0,
    })
  );
  return { seat, socket };
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
    socket?.hear(encodeRoomMessage({ kind: "refused", reason: "replaced" }));
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
    expect(socket?.sentText).toStrictEqual([
      JSON.stringify({ ...browser, rows: [] }),
    ]);
    FakeSocket.opened = [];
    const { seat: off, socket: quiet } = loadingSeat();
    off.leave();
    expect(quiet?.sentText).toStrictEqual([]);
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
    socket?.hear(view.buffer.slice(0, bytes));
    seat.leave();
    const [report] = socket?.sentBuffers ?? [];
    expect(report && readRaceStats(new DataView(report))?.rollbacks).toBe(1);
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
    socket?.hear(view.buffer.slice(0, bytes));
    expect(run.report().net.rollbacks).toBe(1);
  });

  it("sends the room its race stats once when it leaves", () => {
    const { seat, socket } = loadingSeat();
    seat.leave();
    seat.leave();
    const stats = socket?.sentBytes.filter(
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

  it("pings the room from the lobby, so the room can tell it is still there", () => {
    const seat = openRoomSeat(
      "http://rooms.test",
      "friday-ride",
      "Near",
      "test-build",
      "member-key",
      () => null
    );
    const [socket] = FakeSocket.opened;
    socket?.open();
    vi.advanceTimersByTime(PING_EVERY_MS);
    expect(socket?.sentBytes).toStrictEqual([PING_PACKET_BYTES]);
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
    if (socket) {
      socket.answers = false;
    }
    vi.advanceTimersByTime(DEAD_AFTER_MS);
    expect(seat.phase()).toBe("loading");
    vi.advanceTimersByTime(2 * PING_EVERY_MS);
    expect(seat.phase()).toBe("lost");
  });
});
