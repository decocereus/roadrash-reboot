import { ErrorMessage, RaceSnapshotMessage, RoomStateMessage } from "@racer/protocol";
import type { ClientMessage } from "@racer/protocol";
import { Schema } from "effect";
import * as Exit from "effect/Exit";
import type { RaceSnapshotMessage as ServerSnapshotMessage } from "@racer/protocol";
import type { RaceSnapshot, RiderInput, RiderId } from "./types";

export interface RoomSession {
  roomCode: string;
  playerId: string;
  displayName: string;
  host: boolean;
  wsToken: string;
  wsPath: string;
  wsUrl?: string;
}

const RoomSessionSchema = Schema.Struct({
  roomCode: Schema.String,
  playerId: Schema.String,
  displayName: Schema.String,
  host: Schema.Boolean,
  wsToken: Schema.String,
  wsPath: Schema.String,
  wsUrl: Schema.String.pipe(Schema.optional),
});

const RoomErrorSchema = Schema.Struct({
  error: Schema.String.pipe(Schema.optional),
  message: Schema.String.pipe(Schema.optional),
});

export async function createRoom(displayName = "Rider 1"): Promise<RoomSession> {
  return requestRoom("/api/rooms", { displayName });
}

export async function joinRoom(roomCode: string, displayName = "Rider"): Promise<RoomSession> {
  return requestRoom(`/api/rooms/${encodeURIComponent(roomCode)}`, { displayName });
}

async function requestRoom(path: string, body: { displayName: string }): Promise<RoomSession> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    const decodedError = Schema.decodeUnknownExit(RoomErrorSchema)(value);
    const error = Exit.isSuccess(decodedError)
      ? (decodedError.value.message ?? decodedError.value.error)
      : undefined;
    throw new Error(error ?? `Room request failed (${response.status})`);
  }
  const value: unknown = await response.json().catch(() => null);
  const decodedSession = Schema.decodeUnknownExit(RoomSessionSchema)(value);
  if (Exit.isSuccess(decodedSession)) return decodedSession.value;
  throw new Error("Room response was invalid");
}

const riderIds: readonly RiderId[] = ["player", "violet", "amber", "mint"];
const riderColors = [0xff4f72, 0xb66cff, 0xffbd4a, 0x46e3bd];

function normalizeServerSnapshot(
  payload: ServerSnapshotMessage,
  playerId: string,
): RaceSnapshot | null {
  const localIndex = payload.riders.findIndex((rider) => rider.playerId === playerId);
  if (localIndex < 0) return null;
  const orderedServerRiders = [
    payload.riders[localIndex],
    ...payload.riders.filter((_, index) => index !== localIndex),
  ];
  const riders = orderedServerRiders.flatMap((rider, index) => {
    if (!rider) return [];
    const status = rider.status === "crashed";
    return [
      {
        id: riderIds[index],
        name: rider.displayName,
        lane: Math.max(0, Math.min(3, (rider.lane + 1) * 1.5)),
        progress: rider.roadDistance,
        speed: rider.speed * 3.6,
        health: rider.health,
        crashed: status,
        attackFlash: rider.attackTicksRemaining > 0 ? rider.attackTicksRemaining / 30 : 0,
        color: riderColors[index],
        place: rider.place,
      } satisfies RaceSnapshot["riders"][number],
    ];
  });
  const player = riders.find((rider) => rider.id === "player");
  if (!player) return null;
  const traffic = payload.traffic.map((item) => ({
    lane: Math.max(0, Math.min(3, (item.lane + 1) * 1.5)),
    progress: item.distance,
    speed: item.speed * 3.6,
    color: 0x536678,
  }));
  const ordered = [...riders].sort(
    (left, right) =>
      (left.place ?? Number.POSITIVE_INFINITY) - (right.place ?? Number.POSITIVE_INFINITY) ||
      right.progress - left.progress,
  );
  const finishOrder = ordered.filter((rider) => rider.place !== undefined).map((rider) => rider.id);
  const phase =
    payload.phase === "finished" ? "finished" : payload.phase === "aborted" ? "aborted" : "racing";
  const place = player.place ?? ordered.indexOf(player) + 1;
  return {
    phase,
    elapsed: payload.elapsedSeconds,
    distance: payload.trackLength,
    player,
    riders,
    traffic,
    position: place,
    finishOrder,
  };
}

export class RoomTransport {
  private socket: WebSocket | null = null;
  private sequence = 0;
  private playerId = "";
  private onSnapshot: ((snapshot: RaceSnapshot) => void) | null = null;

  connect(
    session: RoomSession,
    onSnapshot: (snapshot: RaceSnapshot) => void,
    onConnected: () => void,
    onRoomState: (phase: string) => void,
    onError: (message: string) => void,
  ): void {
    this.playerId = session.playerId;
    this.onSnapshot = onSnapshot;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const path = session.wsPath.startsWith("/") ? session.wsPath : `/${session.wsPath}`;
    const relativeUrl = session.wsUrl ?? `${path}?ticket=${encodeURIComponent(session.wsToken)}`;
    const socketUrl =
      relativeUrl.startsWith("ws:") || relativeUrl.startsWith("wss:")
        ? relativeUrl
        : `${protocol}//${window.location.host}${relativeUrl.startsWith("/") ? relativeUrl : `/${relativeUrl}`}`;
    try {
      const socket = new WebSocket(socketUrl);
      this.socket = socket;
      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            protocol: 1,
            type: "join",
            ticket: session.wsToken,
            displayName: session.displayName,
          }),
        );
        onConnected();
      });
      socket.addEventListener("message", (event) => {
        try {
          const value: unknown = JSON.parse(String(event.data));
          const errorMessage = Schema.decodeUnknownExit(ErrorMessage)(value);
          if (Exit.isSuccess(errorMessage)) {
            onError(errorMessage.value.message);
            return;
          }
          const roomState = Schema.decodeUnknownExit(RoomStateMessage)(value);
          if (Exit.isSuccess(roomState)) {
            onRoomState(roomState.value.phase);
            return;
          }
          const snapshotMessage = Schema.decodeUnknownExit(RaceSnapshotMessage)(value);
          if (Exit.isSuccess(snapshotMessage)) {
            const snapshot = normalizeServerSnapshot(snapshotMessage.value, this.playerId);
            if (snapshot !== null) this.onSnapshot?.(snapshot);
          }
        } catch {
          onError("The room sent an invalid message");
        }
      });
      socket.addEventListener("error", () => onError("Room connection failed"));
    } catch {
      onError("Room connection failed");
    }
  }

  start(): void {
    this.send({ protocol: 1, type: "start" });
  }

  sendInput(input: RiderInput): void {
    this.send({
      protocol: 1,
      type: "input",
      sequence: this.sequence++,
      input: {
        steer: input.steer,
        throttle: input.throttle ? 1 : 0,
        brake: input.brake ? 1 : 0,
        attack: input.attack,
      },
    });
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.onSnapshot = null;
  }
}
