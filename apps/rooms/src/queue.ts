import { MOST_SEATS } from "@racer/sim/room";
import { ROOM_PROTOCOL } from "@racer/sim/room-wire";

import { createPongs, watchForSilence } from "./heartbeat.ts";
import { SEAT_CLOSED, SEAT_SILENT } from "./messages.ts";
import type { RoomNote } from "./notes.ts";
import type { HostSocket } from "./present.ts";
import { encodeQueueMessage } from "./queue-messages.ts";
import type { QueueMessage } from "./queue-messages.ts";
import { msOf } from "./room-config.ts";
import type { RoomConfig } from "./room-config.ts";

export interface QueuePorts {
  readonly after: (ms: number, wake: () => void) => void;
  readonly build: string;
  readonly config: RoomConfig;
  readonly note: (line: RoomNote) => void;
  readonly now: () => number;
  readonly roomId: () => string;
}

interface Ticket {
  readonly enteredAt: number;
  readonly key: string;
  readonly socket: HostSocket;
  heardAt: number;
}

interface QueueClaim {
  readonly build: string;
  readonly key: string;
  readonly protocol: number;
}

export interface QueueStatus {
  readonly build: string;
  readonly waiting: number;
}

export interface RaceQueue {
  readonly enter: (socket: HostSocket, claim: QueueClaim) => void;
  readonly gone: (socket: HostSocket) => void;
  readonly message: (socket: HostSocket, data: string | ArrayBuffer) => void;
  readonly status: () => QueueStatus;
}

export const createQueue = (ports: QueuePorts): RaceQueue => {
  const bornAt = ports.now();
  const pongFor = createPongs(() => ports.now() - bornAt);
  let tickets: readonly Ticket[] = [];
  let waking = false;

  const send = (socket: HostSocket, data: string | ArrayBufferView): void => {
    try {
      socket.send(data);
    } catch {
      tickets = tickets.filter((ticket) => ticket.socket !== socket);
    }
  };

  const tell = (socket: HostSocket, message: QueueMessage): void => {
    send(socket, encodeQueueMessage(message));
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
      tell(socket, { kind: "placed", roomId });
      socket.close(SEAT_CLOSED, "Placed in a lobby.");
    }
  };

  const deadline = (): number | null => {
    const [oldest] = tickets;
    return oldest
      ? oldest.enteredAt + msOf(ports.config.queueWaitSeconds)
      : null;
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
      tell(socket, { kind: "waiting", riders: tickets.length });
    }
    if (!waking) {
      waking = true;
      ports.after(leavesAt - ports.now(), () => {
        waking = false;
        settle();
      });
    }
  };

  const watchTickets = watchForSilence(ports, {
    heard: () => tickets,
    onSilent: (silent) => {
      tickets = tickets.filter((ticket) => ticket !== silent);
      silent.socket.close(
        SEAT_SILENT,
        "The queue stopped hearing this ticket."
      );
    },
    onSwept: (_now, silent) => {
      if (silent > 0) {
        settle();
      }
      return tickets.length > 0;
    },
  });

  return {
    enter: (socket, claim) => {
      if (claim.build !== ports.build || claim.protocol !== ROOM_PROTOCOL) {
        tell(socket, { kind: "refused", reason: "build" });
        socket.close(SEAT_CLOSED, "build");
        return;
      }
      const now = ports.now();
      const older = tickets.find((ticket) => ticket.key === claim.key);
      const ticket = {
        enteredAt: older?.enteredAt ?? now,
        heardAt: now,
        key: claim.key,
        socket,
      };
      tickets = older
        ? tickets.map((held) => (held === older ? ticket : held))
        : [...tickets, ticket];
      if (older) {
        tell(older.socket, { kind: "refused", reason: "replaced" });
        older.socket.close(SEAT_CLOSED, "replaced");
      }
      watchTickets();
      settle();
    },
    gone: (socket) => {
      tickets = tickets.filter((ticket) => ticket.socket !== socket);
      settle();
    },
    message: (socket, data) => {
      const ticket = tickets.find((held) => held.socket === socket);
      if (ticket === undefined) {
        return;
      }
      ticket.heardAt = ports.now();
      const answer =
        data instanceof ArrayBuffer ? pongFor(new DataView(data)) : null;
      if (answer) {
        send(socket, answer.pong);
      }
    },
    status: () => ({ build: ports.build, waiting: tickets.length }),
  };
};
