import { DurableObject } from "cloudflare:workers";
import { Schema } from "effect";
import {
  botInput,
  createRace,
  inputFor,
  stepRace,
  type RaceEvent,
  type RaceState,
  type RiderInput,
  type RiderState,
} from "@racer/sim";
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  RaceEvent as RaceEventSchema,
  RoomPhase,
  decodeClientMessage,
  encodeServerMessage,
  type ClientMessage,
  type InputState,
  type PlayerState,
  type RaceSnapshotMessage,
  type RoomStateMessage,
  type ServerMessage,
} from "@racer/protocol";

import type { Env, CreateRoomCommand, JoinRoomCommand, RoomCommand, RoomJoinResult } from "./types";

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const COUNTDOWN_TICKS = 90;
const SNAPSHOT_EVERY_TICKS = 3;
const CHECKPOINT_EVERY_TICKS = 30;
const Integer = Schema.Number.pipe(Schema.check(Schema.isInt()));
const OptionalInteger = Schema.optional(Integer);
const SocketAttachmentSchema = Schema.Struct({ playerId: Schema.String, ticket: Schema.String });
const StoredRoomSchema = Schema.Struct({
  roomCode: Schema.String,
  hostPlayerId: Schema.String,
  phase: RoomPhase,
  tick: Integer,
});
const RegistrationSchema = Schema.Struct({
  playerId: Schema.String,
  ticket: Schema.String,
  displayName: Schema.String,
  bot: Integer,
});
const CheckpointRiderSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: Schema.Literals(["human", "bot"] as const),
  lane: Schema.Number,
  lateralVelocity: Schema.optional(Schema.Number),
  roadDistance: Schema.Number,
  speed: Schema.Number,
  health: Schema.Number,
  status: Schema.Literals(["active", "crashed", "finished"] as const),
  crashTicksRemaining: Integer,
  attackCooldownTicks: Integer,
  attackTicksRemaining: Integer,
  hitStunTicksRemaining: Integer,
  riderCollisionCooldownTicks: OptionalInteger,
  place: OptionalInteger,
  lastHitBy: Schema.optional(Schema.String),
});
const RaceStateSchema = Schema.Struct({
  phase: Schema.Literals(["racing", "finished", "aborted"] as const),
  tick: Integer,
  elapsedSeconds: Schema.Number,
  trackLength: Schema.Number,
  maxDurationSeconds: Schema.Number,
  finishCount: Integer,
  seed: Integer,
  riders: Schema.Array(CheckpointRiderSchema),
  traffic: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.Literals(["vehicle", "obstacle"] as const),
      lane: Schema.Literals([-1, 0, 1] as const),
      distance: Schema.Number,
      speed: Schema.Number,
      collisionCooldownTicks: Integer,
    }),
  ),
  events: Schema.Array(RaceEventSchema),
});

type SqlRow = Record<string, string | number | ArrayBuffer | null>;

interface Registration {
  playerId: string;
  ticket: string;
  displayName: string;
  bot: boolean;
}

interface StoredRoom {
  roomCode: string;
  hostPlayerId: string;
  phase: RoomStateMessage["phase"];
  tick: number;
}

interface SocketAttachment {
  playerId: string;
  ticket: string;
}

export class RaceRoom extends DurableObject<Env> {
  private room: StoredRoom = { roomCode: "", hostPlayerId: "", phase: "lobby", tick: 0 };
  private readonly registrations = new Map<string, Registration>();
  private readonly sockets = new Map<string, WebSocket>();
  private readonly inputs = new Map<string, RiderInput>();
  private readonly inputSequences = new Map<string, number>();
  private race: RaceState | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private tickInFlight = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_meta (
          room_code TEXT PRIMARY KEY,
          host_player_id TEXT NOT NULL,
          phase TEXT NOT NULL,
          tick INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS registrations (
          player_id TEXT PRIMARY KEY,
          ticket TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          bot INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS checkpoints (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          tick INTEGER NOT NULL,
          payload TEXT NOT NULL
        );
      `);

      const storedRoomRow = ctx.storage.sql
        .exec<SqlRow>(
          "SELECT room_code as roomCode, host_player_id as hostPlayerId, phase, tick FROM room_meta LIMIT 1",
        )
        .toArray()[0];
      if (storedRoomRow) {
        const storedRoom = Schema.decodeUnknownResult(StoredRoomSchema)(storedRoomRow);
        if (storedRoom._tag === "Success") this.room = storedRoom.success;
      }

      const storedRegistrations = ctx.storage.sql
        .exec<SqlRow>(
          "SELECT player_id as playerId, ticket, display_name as displayName, bot FROM registrations",
        )
        .toArray();
      for (const registrationRow of storedRegistrations) {
        const decodedRegistration = Schema.decodeUnknownResult(RegistrationSchema)(registrationRow);
        if (decodedRegistration._tag === "Failure") continue;
        const registration = decodedRegistration.success;
        this.registrations.set(registration.playerId, {
          ...registration,
          bot: registration.bot === 1,
        });
      }

      for (const socket of ctx.getWebSockets()) {
        const attachment = this.attachment(socket);
        if (!attachment) continue;
        const registration = this.registrationByTicket(attachment.ticket);
        if (registration?.playerId === attachment.playerId)
          this.sockets.set(attachment.playerId, socket);
      }

      const checkpoint = ctx.storage.sql
        .exec<SqlRow>("SELECT tick, payload FROM checkpoints WHERE id = 1")
        .toArray()[0];
      if (checkpoint) {
        try {
          const decodedRace = Schema.decodeUnknownResult(RaceStateSchema)(
            JSON.parse(String(checkpoint.payload)),
          );
          if (decodedRace._tag === "Success")
            this.race = {
              ...decodedRace.success,
              riders: decodedRace.success.riders.map((rider) => ({
                ...rider,
                lateralVelocity: rider.lateralVelocity ?? 0,
                riderCollisionCooldownTicks: rider.riderCollisionCooldownTicks ?? 0,
              })),
            };
        } catch {
          this.race = undefined;
        }
      }

      if (this.race?.phase === "finished") {
        this.room.phase = "finished";
        await this.persistResult();
        this.persistRoom();
      } else if ((this.room.phase === "countdown" || this.room.phase === "racing") && this.race) {
        this.startTickLoop();
      } else if (this.room.phase === "countdown" || this.room.phase === "racing") {
        this.room.phase = "aborted";
        this.persistRoom();
        this.broadcast(this.roomStateMessage());
      }
    });
  }

  async exists(): Promise<boolean> {
    return this.room.roomCode.length > 0;
  }

  async createRoom(command: CreateRoomCommand): Promise<RoomJoinResult> {
    if (this.room.roomCode.length > 0) throw new Error("ROOM_EXISTS");
    this.room = {
      roomCode: command.roomCode,
      hostPlayerId: command.playerId,
      phase: "lobby",
      tick: 0,
    };
    this.persistRoom();
    this.addRegistration({
      playerId: command.playerId,
      ticket: command.ticket,
      displayName: command.displayName,
      bot: false,
    });
    return this.joinResult(command.playerId, command.ticket);
  }

  async joinRoom(command: JoinRoomCommand): Promise<RoomJoinResult> {
    if (!this.room.roomCode) throw new Error("ROOM_NOT_FOUND");
    if (this.room.phase !== "lobby") throw new Error("ALREADY_STARTED");
    if (this.registrations.size >= MAX_PLAYERS) throw new Error("ROOM_FULL");
    this.addRegistration({
      playerId: command.playerId,
      ticket: command.ticket,
      displayName: command.displayName,
      bot: false,
    });
    return this.joinResult(command.playerId, command.ticket);
  }

  async startRace(command: RoomCommand): Promise<{ phase: RoomStateMessage["phase"] }> {
    const registration = this.registrationByTicket(command.ticket);
    if (!registration || registration.bot) throw new Error("NOT_JOINED");
    if (!this.room.roomCode) throw new Error("ROOM_NOT_FOUND");
    if (registration.playerId !== this.room.hostPlayerId) throw new Error("NOT_HOST");
    if (this.room.phase !== "lobby") throw new Error("ALREADY_STARTED");

    this.addBots();
    this.race = createRace({
      riders: Array.from(this.registrations.values()).map((rider) => ({
        id: rider.playerId,
        name: rider.displayName,
        kind: rider.bot ? "bot" : "human",
      })),
      seed: stableSeed(this.room.roomCode),
    });
    this.room.phase = "countdown";
    this.room.tick = 0;
    this.persistRoom();
    this.broadcast(this.roomStateMessage());
    this.startTickLoop();
    return { phase: this.room.phase };
  }

  async getRoomState(): Promise<RoomStateMessage> {
    if (!this.room.roomCode) throw new Error("ROOM_NOT_FOUND");
    return this.roomStateMessage();
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket upgrade required", { status: 426 });
    const ticket = new URL(request.url).searchParams.get("ticket");
    if (!ticket) return new Response("Missing room ticket", { status: 401 });
    const registration = this.registrationByTicket(ticket);
    if (!registration) return new Response("Invalid room ticket", { status: 401 });

    const previousSocket = this.sockets.get(registration.playerId);
    if (previousSocket) previousSocket.close(1000, "Replaced by a newer connection");
    this.inputs.delete(registration.playerId);
    this.inputSequences.delete(registration.playerId);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [registration.playerId]);
    pair[1].serializeAttachment({
      playerId: registration.playerId,
      ticket,
    } satisfies SocketAttachment);
    this.sockets.set(registration.playerId, pair[1]);
    pair[1].send(encodeServerMessage(this.roomStateMessage()));
    if (this.race) pair[1].send(encodeServerMessage(this.snapshotMessage()));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer): void {
    const attachment = this.attachment(socket);
    if (!attachment) return this.closeSocket(socket, 1008, "Missing socket identity");
    const text =
      rawMessage instanceof ArrayBuffer ? new TextDecoder().decode(rawMessage) : rawMessage;
    let unknown: unknown;
    try {
      unknown = JSON.parse(text);
    } catch {
      return this.sendError(socket, "bad_request", "Message must be valid JSON");
    }
    const decoded = decodeClientMessage(unknown);
    if (decoded._tag === "Failure")
      return this.sendError(socket, "invalid_input", "Message does not match the room protocol");
    this.handleMessage(socket, attachment, decoded.success);
  }

  override webSocketClose(socket: WebSocket): void {
    const attachment = this.attachment(socket);
    if (attachment && this.sockets.get(attachment.playerId) === socket) {
      this.sockets.delete(attachment.playerId);
      this.inputs.delete(attachment.playerId);
      this.inputSequences.delete(attachment.playerId);
    }
  }

  override webSocketError(socket: WebSocket): void {
    this.webSocketClose(socket);
  }

  private handleMessage(
    socket: WebSocket,
    attachment: SocketAttachment,
    message: ClientMessage,
  ): void {
    switch (message.type) {
      case "join":
        if (message.ticket !== attachment.ticket)
          return this.sendError(
            socket,
            "invalid_input",
            "Room ticket does not match this connection",
          );
        socket.send(encodeServerMessage(this.roomStateMessage()));
        return;
      case "ping":
        socket.send(
          encodeServerMessage({
            protocol: PROTOCOL_VERSION,
            type: "pong",
            clientTime: message.clientTime,
            serverTime: Date.now(),
          }),
        );
        return;
      case "start":
        void this.startFromSocket(socket, attachment.ticket);
        return;
      case "input":
        this.handleInput(socket, attachment.playerId, message.sequence, message.input);
        return;
      default: {
        const _exhaustive: never = message;
        return _exhaustive;
      }
    }
  }

  private handleInput(
    socket: WebSocket,
    playerId: string,
    sequence: number,
    input: InputState,
  ): void {
    const registration = this.registrations.get(playerId);
    if (!registration || registration.bot)
      return this.sendError(socket, "not_joined", "Player is not in this room");
    if (this.room.phase !== "countdown" && this.room.phase !== "racing") return;
    if (sequence <= (this.inputSequences.get(playerId) ?? -1)) return;
    this.inputSequences.set(playerId, sequence);
    this.inputs.set(playerId, inputFor(input));
  }

  private async startFromSocket(socket: WebSocket, ticket: string): Promise<void> {
    try {
      await this.startRace({ ticket });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start race";
      const code =
        message === "NOT_HOST"
          ? "not_host"
          : message === "ALREADY_STARTED"
            ? "already_started"
            : "bad_request";
      this.sendError(socket, code, message);
    }
  }

  private startTickLoop(): void {
    if (!this.tickTimer) this.tickTimer = setInterval(() => void this.tick(), TICK_MS);
  }

  private async tick(): Promise<void> {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      if (
        !this.race ||
        this.room.phase === "finished" ||
        this.room.phase === "aborted" ||
        this.room.phase === "lobby"
      ) {
        this.stopTickLoop();
        return;
      }
      this.room.tick += 1;
      if (this.room.phase === "countdown" && this.room.tick >= COUNTDOWN_TICKS)
        this.room.phase = "racing";
      if (this.room.phase === "racing") {
        const suppliedInputs: Record<string, RiderInput> = {};
        for (const rider of this.race.riders) {
          suppliedInputs[rider.id] =
            rider.kind === "bot"
              ? botInput(this.race, rider)
              : (this.inputs.get(rider.id) ?? inputFor());
        }
        this.race = stepRace(this.race, suppliedInputs);
        for (const event of this.race.events) this.broadcastEvent(event);
        if (this.race.phase === "finished") {
          this.room.phase = "finished";
          this.persistCheckpoint();
          this.persistRoom();
          this.broadcast(this.snapshotMessage());
          this.broadcast(this.roomStateMessage());
          this.stopTickLoop();
          await this.persistResult();
          return;
        }
      }
      if (this.room.tick % SNAPSHOT_EVERY_TICKS === 0) this.broadcast(this.snapshotMessage());
      if (this.room.tick % CHECKPOINT_EVERY_TICKS === 0) {
        this.persistRoom();
        this.persistCheckpoint();
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private addBots(): void {
    let index = 1;
    while (this.registrations.size < MAX_PLAYERS) {
      const playerId = `bot-${index}`;
      index += 1;
      if (this.registrations.has(playerId)) continue;
      this.addRegistration({
        playerId,
        ticket: `bot-ticket-${playerId}`,
        displayName: `Rival ${index - 1}`,
        bot: true,
      });
    }
  }

  private addRegistration(registration: Registration): void {
    this.registrations.set(registration.playerId, registration);
    this.ctx.storage.sql.exec(
      "INSERT INTO registrations (player_id, ticket, display_name, bot) VALUES (?, ?, ?, ?)",
      registration.playerId,
      registration.ticket,
      registration.displayName,
      registration.bot ? 1 : 0,
    );
  }

  private registrationByTicket(ticket: string): Registration | undefined {
    return Array.from(this.registrations.values()).find(
      (registration) => registration.ticket === ticket,
    );
  }

  private joinResult(playerId: string, ticket: string): RoomJoinResult {
    const registration = this.registrations.get(playerId);
    if (!registration) throw new Error("NOT_JOINED");
    return {
      roomCode: this.room.roomCode,
      playerId,
      displayName: registration.displayName,
      host: playerId === this.room.hostPlayerId,
      wsToken: ticket,
      wsPath: `/ws/${this.room.roomCode}`,
    };
  }

  private roomStateMessage(): RoomStateMessage {
    const riders =
      this.race?.riders ??
      Array.from(this.registrations.values()).map((registration, index) =>
        placeholderRider(registration, index),
      );
    return {
      protocol: PROTOCOL_VERSION,
      type: "room_state",
      roomCode: this.room.roomCode,
      phase: this.room.phase,
      hostPlayerId: this.room.hostPlayerId,
      players: riders.map(toPlayerState),
      maxPlayers: MAX_PLAYERS,
    };
  }

  private snapshotMessage(): RaceSnapshotMessage {
    const race = this.race ?? createRace();
    return {
      protocol: PROTOCOL_VERSION,
      type: "race_snapshot",
      tick: race.tick,
      serverTime: Date.now(),
      phase: race.phase,
      countdownTicksRemaining:
        this.room.phase === "countdown" ? Math.max(0, COUNTDOWN_TICKS - this.room.tick) : 0,
      elapsedSeconds: race.elapsedSeconds,
      trackLength: race.trackLength,
      finishCount: race.finishCount,
      seed: race.seed,
      riders: race.riders.map(toPlayerState),
      traffic: race.traffic,
      events: race.events,
    };
  }

  private broadcast(message: ServerMessage): void {
    const encoded = encodeServerMessage(message);
    for (const socket of this.sockets.values()) {
      try {
        socket.send(encoded);
      } catch {
        // The close callback removes a socket that has already gone away.
      }
    }
  }

  private broadcastEvent(event: RaceEvent): void {
    this.broadcast({
      protocol: PROTOCOL_VERSION,
      type: "race_event",
      event,
      tick: this.race?.tick ?? this.room.tick,
    });
  }

  private sendError(
    socket: WebSocket,
    code: Extract<ServerMessage, { type: "error" }>["code"],
    message: string,
  ): void {
    socket.send(encodeServerMessage({ protocol: PROTOCOL_VERSION, type: "error", code, message }));
  }

  private attachment(socket: WebSocket): SocketAttachment | undefined {
    const decoded = Schema.decodeUnknownResult(SocketAttachmentSchema)(
      socket.deserializeAttachment(),
    );
    return decoded._tag === "Success" ? decoded.success : undefined;
  }

  private closeSocket(socket: WebSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      // The socket has already closed.
    }
  }

  private persistRoom(): void {
    if (!this.room.roomCode) return;
    this.ctx.storage.sql.exec(
      "INSERT INTO room_meta (room_code, host_player_id, phase, tick) VALUES (?, ?, ?, ?) ON CONFLICT(room_code) DO UPDATE SET phase = excluded.phase, tick = excluded.tick",
      this.room.roomCode,
      this.room.hostPlayerId,
      this.room.phase,
      this.room.tick,
    );
  }

  private persistCheckpoint(): void {
    if (!this.race) return;
    this.ctx.storage.sql.exec(
      "INSERT INTO checkpoints (id, tick, payload) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET tick = excluded.tick, payload = excluded.payload",
      this.room.tick,
      JSON.stringify(this.race),
    );
  }

  private async persistResult(): Promise<void> {
    if (!this.env.RESULTS_DB || !this.room.roomCode || !this.race) return;
    await this.env.RESULTS_DB.prepare(
      "INSERT INTO race_results (room_code, result_json, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(room_code) DO NOTHING",
    )
      .bind(
        this.room.roomCode,
        JSON.stringify(
          this.race.riders.map((rider) => ({ playerId: rider.id, place: rider.place ?? null })),
        ),
      )
      .run();
  }

  private stopTickLoop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }
}

function stableSeed(roomCode: string): number {
  let hash = 0x811c9dc5;
  for (const char of roomCode) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return hash >>> 0;
}

function placeholderRider(registration: Registration, index: number): RiderState {
  return {
    id: registration.playerId,
    name: registration.displayName,
    kind: registration.bot ? "bot" : "human",
    lane: (index % 3) - 1,
    lateralVelocity: 0,
    roadDistance: 0,
    speed: 0,
    health: 100,
    status: "active",
    crashTicksRemaining: 0,
    attackCooldownTicks: 0,
    attackTicksRemaining: 0,
    hitStunTicksRemaining: 0,
    riderCollisionCooldownTicks: 0,
  };
}

function toPlayerState(rider: RiderState): PlayerState {
  const player: PlayerState = {
    playerId: rider.id,
    displayName: rider.name,
    kind: rider.kind,
    lane: rider.lane,
    roadDistance: rider.roadDistance,
    speed: rider.speed,
    health: rider.health,
    status: rider.status,
    crashTicksRemaining: rider.crashTicksRemaining,
    attackCooldownTicks: rider.attackCooldownTicks,
    attackTicksRemaining: rider.attackTicksRemaining,
    hitStunTicksRemaining: rider.hitStunTicksRemaining,
    place: rider.place,
    lastHitBy: rider.lastHitBy,
  };
  return player;
}
