import { Schema } from "effect";

import {
  CreateRoom,
  JoinRoom,
  clampDisplayName,
  type CreateRoom as CreateRoomData,
  type JoinRoom as JoinRoomData,
  type RoomStateMessage,
} from "@racer/protocol";

import type { Env, RoomJoinResult } from "./types";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const StartRoom = Schema.Struct({ ticket: Schema.String });
type RoomJoinHttpResult = RoomJoinResult & { readonly wsUrl: string };
type JsonResponseBody =
  | string
  | number
  | boolean
  | null
  | RoomJoinHttpResult
  | RoomStateMessage
  | { readonly phase: RoomStateMessage["phase"] }
  | { readonly error: string; readonly message?: string };

export function json(data: JsonResponseBody, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...init.headers },
  });
}

export function badRequest(message: string): Response {
  return json({ error: "bad_request", message }, { status: 400 });
}

export function notFound(message = "Not found"): Response {
  return json({ error: "not_found", message }, { status: 404 });
}

export function methodNotAllowed(): Response {
  return json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "POST, GET" } });
}

export async function parseJson<T, S extends Schema.ConstraintDecoder<T, never>>(
  request: Request,
  schema: S,
): Promise<T | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const decoded = Schema.decodeUnknownResult(schema)(body);
  if (decoded._tag === "Failure") {
    return badRequest("Request body has an invalid shape");
  }
  return decoded.success;
}

export async function createRoom(request: Request, env: Env): Promise<Response> {
  const parsed = await parseJson<CreateRoomData, typeof CreateRoom>(request, CreateRoom);
  if (parsed instanceof Response) return parsed;

  const code = await allocateRoomCode(env);
  const stub = env.RACE_ROOM.getByName(code);
  const playerId = newId("p");
  const displayName = clampDisplayName(parsed.displayName, "Rider 1");
  const ticket = newId("t");
  const result = await stub.createRoom({ roomCode: code, playerId, displayName, ticket });
  return json(
    { ...result, wsToken: ticket, wsUrl: `/ws/${code}?ticket=${encodeURIComponent(ticket)}` },
    { status: 201 },
  );
}

export async function joinRoom(request: Request, env: Env, roomCode: string): Promise<Response> {
  const parsed = await parseJson<JoinRoomData, typeof JoinRoom>(request, JoinRoom);
  if (parsed instanceof Response) return parsed;

  const playerId = newId("p");
  const stub = env.RACE_ROOM.getByName(roomCode);
  try {
    const ticket = newId("t");
    const result = await stub.joinRoom({
      playerId,
      displayName: clampDisplayName(parsed.displayName, "Rider"),
      ticket,
    });
    return json({
      ...result,
      wsToken: ticket,
      wsUrl: `/ws/${roomCode}?ticket=${encodeURIComponent(ticket)}`,
    });
  } catch (error) {
    return roomError(error instanceof Error ? error : "Room operation failed");
  }
}

export async function startRoom(request: Request, env: Env, roomCode: string): Promise<Response> {
  const parsed = await parseJson<{ ticket: string }, typeof StartRoom>(request, StartRoom);
  if (parsed instanceof Response) return parsed;

  try {
    const result = await env.RACE_ROOM.getByName(roomCode).startRace({ ticket: parsed.ticket });
    return json(result);
  } catch (error) {
    return roomError(error instanceof Error ? error : "Room operation failed");
  }
}

export async function roomStatus(env: Env, roomCode: string): Promise<Response> {
  try {
    return json(await env.RACE_ROOM.getByName(roomCode).getRoomState());
  } catch (error) {
    return roomError(error instanceof Error ? error : "Room operation failed");
  }
}

async function allocateRoomCode(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomRoomCode();
    const stub = env.RACE_ROOM.getByName(code);
    if (!(await stub.exists())) return code;
  }
  throw new Error("Unable to allocate a room code");
}

function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function roomError(error: Error | string): Response {
  const message = error instanceof Error ? error.message : error;
  const status = message === "ROOM_NOT_FOUND" ? 404 : message === "ROOM_FULL" ? 409 : 400;
  return json({ error: message.toLowerCase(), message }, { status });
}
