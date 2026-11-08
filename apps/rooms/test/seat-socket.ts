import { STARTING_BIKE } from "@racer/career/tables";
import { coasting } from "@racer/sim/control";
import { clearFrame, createTickFrame } from "@racer/sim/room-frame";
import {
  PING_PACKET_BYTES,
  PONG_PACKET_BYTES,
  readPing,
  ROOM_PROTOCOL,
  writePong,
  writeTick,
} from "@racer/sim/room-wire";
import { riderIdAt } from "@racer/sim/state";

import { encodeRoomMessage } from "../src/messages.ts";
import type { RoomMessage } from "../src/messages.ts";
import { launchRoomConfig, publicRuleFor } from "../src/room-config.ts";
import { openRoomSeat } from "../src/seat-client.ts";
import type { SeatTrace } from "../src/seat-client.ts";
import type { SeatBrowser } from "../src/tape.ts";

const PUBLIC_RULE = publicRuleFor(launchRoomConfig.publicRace, 0);

export const DEAD_AFTER_MS = 5000;
export const PING_EVERY_MS = 500;
export const ABNORMAL_CLOSE = 1006;

interface SocketEvent {
  readonly code?: number;
  readonly data?: string | ArrayBuffer;
}

export class FakeSocket {
  static readonly OPEN = 1;

  static readonly CLOSING = 2;

  static opened: FakeSocket[] = [];

  readyState = FakeSocket.OPEN;

  closedWith: number | null = null;

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
    this.readyState = FakeSocket.CLOSING;
    this.closedWith = code;
  }

  closedByBrowser(): void {
    this.heard.get("close")?.({ code: this.closedWith ?? ABNORMAL_CLOSE });
  }

  droppedByRoom(code: number): void {
    this.closedWith = code;
    this.readyState = FakeSocket.CLOSING;
    this.closedByBrowser();
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

export const startedMessage = {
  awayMs: null,
  kind: "started",
  manifest: {
    build: "test-build",
    contentHash: [0],
    loadingDeadlineMs: 20_000,
    protocol: ROOM_PROTOCOL,
    raceId: "race-1",
    raceLimitSeconds: 360,
    reconnect: { holdSeconds: 30 },
    roster: [
      {
        bikeId: STARTING_BIKE,
        colour: 0,
        kind: "human",
        name: "Near",
        rider: 0,
      },
    ],
    rule: PUBLIC_RULE,
    seed: 1,
    tickRate: 60,
    trackHash: [0],
  },
  you: 0,
} satisfies RoomMessage;

export const lobbyMessage = (edition: number) =>
  ({
    atMs: 0,
    edition,
    hostId: "near",
    kind: "lobby",
    members: [
      { colour: 0, here: true, id: "near", name: "Near", ready: false },
    ],
    phase: "gathering",
    roomKind: "custom",
    rule: PUBLIC_RULE,
    seatHoldSeconds: 30,
    startsInMs: null,
    you: "near",
  }) satisfies RoomMessage;

export const started = encodeRoomMessage(startedMessage);
export const lobbyAt = (edition: number): string =>
  encodeRoomMessage(lobbyMessage(edition));
export const countdown = encodeRoomMessage({ kind: "countdown", startAtMs: 0 });
export const ended = encodeRoomMessage({ kind: "ended", tick: 0 });
export const replaced = encodeRoomMessage({
  kind: "refused",
  reason: "replaced",
});

export const raceDataSwitch = (browser: SeatBrowser, sharing: boolean) => {
  let on = sharing;
  const turns = new Set<(sharing: boolean) => void>();
  const trace: SeatTrace = {
    browser: () => browser,
    sharing: () => on,
    watch: (turned) => {
      turns.add(turned);
      return () => {
        turns.delete(turned);
      };
    },
  };
  return {
    trace,
    turn: (next: boolean) => {
      on = next;
      for (const turned of turns) {
        turned(next);
      }
    },
    watched: () => turns.size > 0,
  };
};

export const newSeat = (trace: SeatTrace | null = null) => {
  const seat = openRoomSeat(
    "http://rooms.test",
    "friday-ride",
    "Near",
    "test-build",
    "member-key",
    trace
  );
  const socket = FakeSocket.opened.at(-1);
  if (!socket) {
    throw new Error("The seat opened no socket.");
  }
  socket.open();
  return { seat, socket };
};

export const loadingSeat = (trace: SeatTrace | null = null) => {
  const { seat, socket } = newSeat(trace);
  socket.hear(started);
  return { seat, socket };
};

export const hearTick = (socket: FakeSocket, tick: number): void => {
  const frame = createTickFrame();
  clearFrame(frame, tick);
  frame.controls.set(riderIdAt(0), coasting);
  const view = new DataView(new ArrayBuffer(64));
  const bytes = writeTick(view, frame, null);
  socket.hear(view.buffer.slice(0, bytes));
};
