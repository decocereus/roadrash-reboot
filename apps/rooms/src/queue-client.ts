import { ROOM_PROTOCOL } from "@racer/sim/room-wire";
import * as Option from "effect/Option";

import { SEAT_CLOSED } from "./messages.ts";
import { decodeQueueMessage } from "./queue-messages.ts";
import type { QueueMessage } from "./queue-messages.ts";

export interface QueueListeners {
  readonly onLost: () => void;
  readonly onMessage: (message: QueueMessage) => void;
}

export const queueUrl = (roomsUrl: string, build: string): string => {
  const url = new URL(`${roomsUrl}/queue/seat`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("build", build);
  url.searchParams.set("protocol", String(ROOM_PROTOCOL));
  return url.toString();
};

export const enterQueue = (
  roomsUrl: string,
  build: string,
  { onLost, onMessage }: QueueListeners
): (() => void) => {
  const socket = new WebSocket(queueUrl(roomsUrl, build));
  let settled = false;
  socket.addEventListener("message", (event) => {
    const message = decodeQueueMessage(event.data);
    if (Option.isSome(message)) {
      settled = message.value.kind !== "waiting";
      onMessage(message.value);
    }
  });
  socket.addEventListener("close", () => {
    if (!settled) {
      settled = true;
      onLost();
    }
  });
  return () => {
    settled = true;
    socket.close(SEAT_CLOSED, "The rider left the queue.");
  };
};
