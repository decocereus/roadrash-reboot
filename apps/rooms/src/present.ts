import { encodeRoomMessage } from "./messages.ts";
import type { RoomLobbyMessage, RoomMessage } from "./messages.ts";
import type { Run } from "./race-build.ts";
import type { Seat, SeatLink } from "./race-seat.ts";
import type { SocketBudget } from "./socket-budget.ts";
import { roleAfter } from "./socket-role.ts";
import type { SocketEvent, SocketRole } from "./socket-role.ts";

export const SEND_FAILED = Number.NEGATIVE_INFINITY;

export interface HostSocket {
  readonly send: (data: string | ArrayBufferView) => void;
  readonly close: (code: number, reason: string) => void;
}

export interface Present {
  readonly budget: SocketBudget;
  readonly link: SeatLink;
  readonly memberId: string;
  readonly name: string;
  readonly socket: HostSocket;
  arrived: boolean;
  heardAt: number;
  role: SocketRole<Run, Seat>;
  walk: string | null;
}

export const moveSocket = (
  person: Present,
  event: SocketEvent<Run, Seat>
): void => {
  person.role = roleAfter(person.role, event) ?? person.role;
};

export const createAudience = (present: ReadonlyMap<HostSocket, Present>) => {
  const sendTo = (socket: HostSocket, data: string | ArrayBufferView): void => {
    try {
      socket.send(data);
    } catch {
      const person = present.get(socket);
      if (person) {
        person.heardAt = SEND_FAILED;
      }
    }
  };
  const tell = (message: RoomMessage): void => {
    const text = encodeRoomMessage(message);
    for (const { role, socket } of present.values()) {
      if (role.kind === "seated") {
        sendTo(socket, text);
      }
    }
  };
  const tellWalkers = (from: HostSocket, text: string): void => {
    for (const { role, socket } of present.values()) {
      if (socket !== from && role.kind === "lobby") {
        sendTo(socket, text);
      }
    }
  };
  const tellLobby = (message: Omit<RoomLobbyMessage, "you">): void => {
    for (const { memberId, role, socket } of present.values()) {
      if (role.kind === "lobby") {
        sendTo(socket, encodeRoomMessage({ ...message, you: memberId }));
      }
    }
  };
  return { sendTo, tell, tellLobby, tellWalkers };
};
