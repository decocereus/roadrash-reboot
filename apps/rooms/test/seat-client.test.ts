import {
  PING_PACKET_BYTES,
  PONG_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  readPing,
  writePong,
} from "@racer/sim/room-wire";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRoomMessage } from "../src/messages.ts";
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
    browser
  );
  const [socket] = FakeSocket.opened;
  socket?.open();
  socket?.hear(
    encodeRoomMessage({
      digest: [0],
      kind: "started",
      names: ["Near"],
      raceId: "race-1",
      seats: 1,
      seed: 1,
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
