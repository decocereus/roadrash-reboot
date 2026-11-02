import { decodeRoomMessage, SEAT_CLOSED } from "@racer/rooms/messages";
import type { RoomMessage } from "@racer/rooms/messages";
import { createRoomClock } from "@racer/sim/room-clock";
import { createTickFrame } from "@racer/sim/room-frame";
import {
  createReadTick,
  inputBytes,
  MOST_BATCHED_CONTROLS,
  PING_PACKET_BYTES,
  readPong,
  READY_PACKET_BYTES,
  readTick,
  START_PACKET_BYTES,
  writeInput,
  writePing,
  writeReady,
  writeStart,
} from "@racer/sim/room-wire";
import { TICK_SECONDS } from "@racer/sim/state";
import type { Control } from "@racer/sim/state";
import * as Option from "effect/Option";

import { weavingControl } from "./seat.ts";

const TICK_MS = TICK_SECONDS * 1000;
const PING_EVERY_MS = 500;
const GAP_BUCKETS = 2000;

export interface LoadTally {
  heard: number;
  lost: number;
  refused: number;
  worstRttMs: number;
  readonly gaps: Uint32Array;
}

export const createLoadTally = (): LoadTally => ({
  gaps: new Uint32Array(GAP_BUCKETS),
  heard: 0,
  lost: 0,
  refused: 0,
  worstRttMs: 0,
});

export interface ThinSeat {
  readonly leave: () => void;
  readonly start: () => void;
}

export const openThinSeat = (
  roomsUrl: string,
  raceId: string,
  inputEvery: number,
  tally: LoadTally
): ThinSeat => {
  const socket = new WebSocket(
    `${roomsUrl.replace(/^http/u, "ws")}/rooms/${raceId}/seat?name=Load`
  );
  socket.binaryType = "arraybuffer";
  const clock = createRoomClock();
  const read = createReadTick(createTickFrame());
  const pong = { stamp: 0, tick: 0 };
  const input = new DataView(
    new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS))
  );
  const ping = new DataView(new ArrayBuffer(PING_PACKET_BYTES));
  const batch: Control[] = [];
  let rider = 0;
  let confirmed = 0;
  let sentThrough = 0;
  let lastArrival = 0;
  let beats = 0;
  let left = false;
  let timers: readonly ReturnType<typeof setInterval>[] = [];

  const stop = (): void => {
    for (const timer of timers) {
      clearInterval(timer);
    }
    timers = [];
  };

  const sendControls = (): void => {
    beats += 1;
    if (beats % inputEvery !== 0 || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const unsent = Math.max(sentThrough, confirmed) + 1;
    const last = Math.min(
      clock.target(performance.now()),
      unsent + MOST_BATCHED_CONTROLS - 1
    );
    if (last < unsent) {
      return;
    }
    const first = Math.max(confirmed + 1, last - MOST_BATCHED_CONTROLS + 1);
    batch.length = 0;
    for (let tick = first; tick <= last; tick += 1) {
      batch.push(weavingControl(tick, rider));
    }
    sentThrough = last;
    const bytes = writeInput(input, first, batch);
    socket.send(new Uint8Array(input.buffer, 0, bytes));
  };

  const sendPing = (): void => {
    if (socket.readyState === WebSocket.OPEN) {
      writePing(ping, Math.floor(performance.now()));
      socket.send(new Uint8Array(ping.buffer, 0, PING_PACKET_BYTES));
    }
  };

  const sendReady = (): void => {
    const packet = new DataView(new ArrayBuffer(READY_PACKET_BYTES));
    writeReady(packet);
    socket.send(packet.buffer);
  };

  const onBinary = (data: ArrayBuffer): void => {
    const view = new DataView(data);
    if (readPong(view, pong)) {
      const rtt = Math.floor(performance.now()) - pong.stamp;
      tally.worstRttMs = Math.max(tally.worstRttMs, rtt);
      clock.heardRtt(rtt);
      return;
    }
    if (!readTick(view, read)) {
      return;
    }
    const now = performance.now();
    if (lastArrival !== 0) {
      const bucket = Math.min(GAP_BUCKETS - 1, Math.round(now - lastArrival));
      tally.gaps[bucket] = (tally.gaps[bucket] ?? 0) + 1;
    }
    lastArrival = now;
    tally.heard += 1;
    confirmed = read.frame.tick;
    clock.heardTick(confirmed, now);
  };

  const onMessage = (message: RoomMessage): void => {
    switch (message.kind) {
      case "lobby": {
        break;
      }
      case "started": {
        rider = message.you;
        sendReady();
        break;
      }
      case "countdown": {
        clock.start(message.startsInMs, performance.now());
        timers = [
          setInterval(sendControls, TICK_MS),
          setInterval(sendPing, PING_EVERY_MS),
        ];
        break;
      }
      case "ended": {
        left = true;
        stop();
        socket.close(SEAT_CLOSED, "The race is over.");
        break;
      }
      case "refused": {
        left = true;
        tally.refused += 1;
        socket.close(SEAT_CLOSED, "This seat was refused.");
        break;
      }
      default: {
        message satisfies never;
      }
    }
  };

  socket.addEventListener("message", (event) => {
    const data: unknown = event.data;
    if (data instanceof ArrayBuffer) {
      onBinary(data);
      return;
    }
    const message = decodeRoomMessage(data);
    if (Option.isSome(message)) {
      onMessage(message.value);
    }
  });
  socket.addEventListener("close", () => {
    stop();
    tally.lost += left ? 0 : 1;
  });

  return {
    leave: () => {
      left = true;
      stop();
      socket.close(SEAT_CLOSED, "The load test is over.");
    },
    start: () => {
      const packet = new DataView(new ArrayBuffer(START_PACKET_BYTES));
      writeStart(packet);
      socket.send(packet.buffer);
    },
  };
};
