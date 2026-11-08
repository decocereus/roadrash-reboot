import { ROOM_PROTOCOL } from "@racer/sim/room-wire";
import * as Option from "effect/Option";

import { createPings } from "./heartbeat.ts";
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
  const pings = createPings(socket);
  let settled = false;

  const lose = (): void => {
    pings.stop();
    if (!settled) {
      settled = true;
      onLost();
    }
  };

  socket.addEventListener("open", () => {
    pings.start({
      onSilent: () => {
        lose();
        socket.close(SEAT_CLOSED, "The queue went silent.");
      },
    });
  });
  socket.addEventListener("message", (event) => {
    const data: unknown = event.data;
    if (data instanceof ArrayBuffer) {
      pings.hear(new DataView(data));
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
    pings.stop();
    socket.close(SEAT_CLOSED, "The rider left the queue.");
  };
};
