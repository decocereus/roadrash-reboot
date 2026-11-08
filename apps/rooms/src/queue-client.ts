import {
  PING_PACKET_BYTES,
  readPong,
  ROOM_PROTOCOL,
  writePing,
} from "@racer/sim/room-wire";
import * as Option from "effect/Option";

import { MOST_UNANSWERED_PINGS, PING_EVERY_MS } from "./heartbeat.ts";
import { SEAT_CLOSED } from "./messages.ts";
import { decodeQueueMessage } from "./queue-messages.ts";
import type { QueueMessage } from "./queue-messages.ts";

export interface QueueListeners {
  readonly onLost: () => void;
  readonly onMessage: (message: QueueMessage) => void;
}

export const queueUrl = (
  roomsUrl: string,
  build: string,
  key: string
): string => {
  const url = new URL(`${roomsUrl}/queue/seat`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("build", build);
  url.searchParams.set("protocol", String(ROOM_PROTOCOL));
  url.searchParams.set("key", key);
  return url.toString();
};

export const enterQueue = (
  roomsUrl: string,
  build: string,
  key: string,
  { onLost, onMessage }: QueueListeners
): (() => void) => {
  const socket = new WebSocket(queueUrl(roomsUrl, build, key));
  socket.binaryType = "arraybuffer";
  const ping = new DataView(new ArrayBuffer(PING_PACKET_BYTES));
  const pong = { roomMs: 0, stamp: 0 };
  let settled = false;
  let unansweredPings = 0;
  let pings: ReturnType<typeof setInterval> | null = null;

  const stopPings = (): void => {
    if (pings) {
      clearInterval(pings);
      pings = null;
    }
  };

  const lose = (): void => {
    stopPings();
    if (!settled) {
      settled = true;
      onLost();
    }
  };

  const sendPing = (): void => {
    if (unansweredPings > MOST_UNANSWERED_PINGS) {
      lose();
      socket.close(SEAT_CLOSED, "The queue went silent.");
      return;
    }
    writePing(ping, Math.floor(performance.now()));
    socket.send(new Uint8Array(ping.buffer, 0, PING_PACKET_BYTES));
    unansweredPings += 1;
  };

  socket.addEventListener("open", () => {
    pings = setInterval(sendPing, PING_EVERY_MS);
  });
  socket.addEventListener("message", (event) => {
    const data: unknown = event.data;
    if (data instanceof ArrayBuffer) {
      if (readPong(new DataView(data), pong)) {
        unansweredPings = 0;
      }
      return;
    }
    const message = decodeQueueMessage(data);
    if (Option.isSome(message)) {
      settled = message.value.kind !== "waiting";
      onMessage(message.value);
    }
  });
  socket.addEventListener("close", lose);
  return () => {
    settled = true;
    stopPings();
    socket.close(SEAT_CLOSED, "The rider left the queue.");
  };
};
