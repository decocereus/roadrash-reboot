import type { RaceRoom } from "./room";

export interface Env {
  RACE_ROOM: DurableObjectNamespace<RaceRoom>;
  RESULTS_DB?: D1Database;
}

export interface PlayerRegistration {
  playerId: string;
  displayName: string;
  bot: boolean;
}

export interface RoomJoinResult {
  roomCode: string;
  playerId: string;
  displayName: string;
  host: boolean;
  wsToken: string;
  wsPath: string;
}

export interface RoomCommand {
  ticket: string;
}

export interface CreateRoomCommand {
  roomCode: string;
  playerId: string;
  displayName: string;
  ticket: string;
}

export interface JoinRoomCommand {
  playerId: string;
  displayName: string;
  ticket: string;
}
