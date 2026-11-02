import {
  PING_PACKET_BYTES,
  PONG_PACKET_BYTES,
  readPing,
  writePong,
} from "@racer/sim/room-wire";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRoomMessage } from "../src/messages.ts";
import { openRoomSeat } from "../src/seat-client.ts";

const LONGEST_LOAD_MS = 20_000;
const DEAD_AFTER_MS = 5000;
const PING_EVERY_MS = 500;

interface SocketEvent {
  readonly code?: number;
  readonly data?: string | ArrayBuffer;
}

class FakeSocket {
  static opened: FakeSocket[] = [];

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

  hear(data: string | ArrayBuffer): void {
    this.heard.get("message")?.({ data });
  }

  send(data: Uint8Array): void {
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

const loadingSeat = () => {
  const seat = openRoomSeat("http://rooms.test", "friday-ride", "Near");
  const [socket] = FakeSocket.opened;
  socket?.hear(
    encodeRoomMessage({
      digest: [0],
      kind: "started",
      names: ["Near"],
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
