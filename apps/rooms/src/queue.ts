import { MOST_SEATS } from "@racer/sim/room";
import { ROOM_PROTOCOL } from "@racer/sim/room-wire";

import type { HostSocket } from "./host.ts";
import { SEAT_CLOSED } from "./messages.ts";
import type { RoomNote } from "./notes.ts";
import { encodeQueueMessage } from "./queue-messages.ts";
import type { QueueMessage } from "./queue-messages.ts";

export const QUEUE_WAIT_MS = 30_000;

export interface QueuePorts {
  readonly after: (ms: number, wake: () => void) => void;
  readonly build: string;
  readonly note: (line: RoomNote) => void;
  readonly now: () => number;
  readonly roomId: () => string;
}

interface Ticket {
  readonly enteredAt: number;
  readonly socket: HostSocket;
}

interface QueueClaim {
  readonly build: string;
  readonly protocol: number;
}

export interface QueueStatus {
  readonly build: string;
  readonly waiting: number;
}

export interface RaceQueue {
  readonly enter: (socket: HostSocket, claim: QueueClaim) => void;
  readonly gone: (socket: HostSocket) => void;
  readonly status: () => QueueStatus;
}

export const createQueue = (ports: QueuePorts): RaceQueue => {
  let tickets: readonly Ticket[] = [];
  let waking = false;

  const send = (socket: HostSocket, message: QueueMessage): void => {
    try {
      socket.send(encodeQueueMessage(message));
    } catch {
      tickets = tickets.filter((ticket) => ticket.socket !== socket);
    }
  };

  const form = (): void => {
    const group = tickets.slice(0, MOST_SEATS);
    tickets = tickets.slice(MOST_SEATS);
    const roomId = ports.roomId();
    const now = ports.now();
    const [oldest] = group;
    ports.note({
      kind: "placed",
      riders: group.length,
      waitedMs: now - (oldest?.enteredAt ?? now),
    });
    for (const { socket } of group) {
      send(socket, { kind: "placed", roomId });
      socket.close(SEAT_CLOSED, "Placed in a lobby.");
    }
  };

  const deadline = (): number | null => {
    const [oldest] = tickets;
    return oldest ? oldest.enteredAt + QUEUE_WAIT_MS : null;
  };

  const settle = (): void => {
    while (tickets.length >= MOST_SEATS) {
      form();
    }
    const at = deadline();
    if (at !== null && ports.now() >= at) {
      form();
    }
    const leavesAt = deadline();
    if (leavesAt === null) {
      return;
    }
    for (const { socket } of tickets) {
      send(socket, { kind: "waiting", riders: tickets.length });
    }
    if (!waking) {
      waking = true;
      ports.after(leavesAt - ports.now(), () => {
        waking = false;
        settle();
      });
    }
  };

  return {
    enter: (socket, claim) => {
      if (claim.build !== ports.build || claim.protocol !== ROOM_PROTOCOL) {
        send(socket, { kind: "refused" });
        socket.close(SEAT_CLOSED, "build");
        return;
      }
      tickets = [...tickets, { enteredAt: ports.now(), socket }];
      settle();
    },
    gone: (socket) => {
      tickets = tickets.filter((ticket) => ticket.socket !== socket);
      settle();
    },
    status: () => ({ build: ports.build, waiting: tickets.length }),
  };
};
