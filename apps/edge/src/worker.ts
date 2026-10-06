import {
  badRequest,
  createRoom,
  joinRoom,
  json,
  methodNotAllowed,
  notFound,
  roomStatus,
  startRoom,
} from "./http";
import type { Env } from "./types";

const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    const wsCode = segments[1];
    if (segments[0] === "ws" && wsCode) {
      if (!ROOM_CODE_PATTERN.test(wsCode)) return notFound("Room not found");
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return json(
          { error: "upgrade_required", message: "Use a WebSocket upgrade" },
          { status: 426 },
        );
      }
      return env.RACE_ROOM.getByName(wsCode).fetch(request);
    }

    if (segments[0] !== "api" || segments[1] !== "rooms") {
      return notFound();
    }

    const roomCode = segments[2];
    if (roomCode && !ROOM_CODE_PATTERN.test(roomCode))
      return badRequest("Room code must be six characters");

    if (segments.length === 2 && request.method === "POST") return createRoom(request, env);
    if (roomCode && segments.length === 3 && request.method === "GET")
      return roomStatus(env, roomCode);
    if (roomCode && segments.length === 3 && request.method === "POST")
      return joinRoom(request, env, roomCode);
    if (roomCode && segments.length === 4 && segments[3] === "start" && request.method === "POST") {
      return startRoom(request, env, roomCode);
    }
    return methodNotAllowed();
  },
};

export { RaceRoom } from "./room";
