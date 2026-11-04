import {
  publicRoomRule,
  publicRuleFor,
  seatedRace,
} from "@racer/career/room-race";
import { createRoom, firstRacers, MOST_SEATS } from "@racer/sim/room";
import type { Room } from "@racer/sim/room";
import { createTapeWriter, hexOfWords } from "@racer/sim/room-tape";
import type { TapeWriter } from "@racer/sim/room-tape";
import {
  createInputBatch,
  PONG_PACKET_BYTES,
  readInput,
  readPing,
  readRaceStats,
  readReady,
  ROOM_PROTOCOL,
  tickCapacity,
  writePong,
  writeTick,
} from "@racer/sim/room-wire";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { trackDigest } from "@racer/sim/snapshot-setup";
import { TICK_SECONDS } from "@racer/sim/state";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { RoomStatus } from "./contract.ts";
import { createLobby } from "./lobby.ts";
import type { RaceManifest } from "./manifest.ts";
import {
  decodeLobbyCommand,
  encodeRoomMessage,
  SEAT_CLOSED,
  SEAT_SILENT,
} from "./messages.ts";
import type { LobbyCommand, Refusal, RoomMessage } from "./messages.ts";
import { WAKE_GAP_CEILINGS_MS } from "./notes.ts";
import type { RoomNote } from "./notes.ts";
import { raceSeatsOf, seatFor, tallyOf, traceSeats } from "./race-seat.ts";
import type { Seat, SeatLink } from "./race-seat.ts";
import type { RoomKind } from "./room-id.ts";
import {
  BrowserTraceSchema,
  MOST_TRACE_CHARS,
  riderTraceName,
  ROOM_TRACE_EVERY_TICKS,
  roomTraceName,
  TAPE_VERSION,
  tapeEndName,
  tapeHeaderName,
  tapeKey,
  tapePartName,
} from "./tape.ts";
import type { RoomTrace } from "./tape.ts";

const TICK_MS = TICK_SECONDS * 1000;
const MOST_CATCH_UP_TICKS = 4;
const START_DELAY_MS = 3000;
const READY_DEADLINE_MS = 20_000;
const REPORT_GRACE_MS = 5000;
const NO_STAMP = 0;
const SILENT_SEAT_MS = 10_000;
const SEAT_WATCH_MS = 1000;
const SEND_FAILED = Number.NEGATIVE_INFINITY;

const decodeBrowserTrace = Schema.decodeUnknownOption(
  Schema.fromJsonString(BrowserTraceSchema)
);

export interface HostSocket {
  readonly send: (data: string | ArrayBufferView) => void;
  readonly close: (code: number, reason: string) => void;
}

export interface SeatClaim {
  readonly build: string;
  readonly key: string;
  readonly protocol: number;
}

export interface HostPorts {
  readonly build: string;
  readonly now: () => number;
  readonly after: (ms: number, wake: () => void) => void;
  readonly note: (note: RoomNote) => void;
  readonly raceId: () => string;
  readonly saveTape: (key: string, body: string | Uint8Array) => void;
  readonly seed: () => number;
}

interface Present {
  readonly link: SeatLink;
  readonly memberId: string;
  readonly name: string;
  readonly socket: HostSocket;
  heardAt: number;
}

interface Running {
  readonly loading: Set<HostSocket>;
  readonly raceId: string;
  readonly riders: readonly Seat[];
  readonly room: Room;
  readonly since: number;
  readonly tape: TapeWriter;
  readonly trace: number[];
  readonly wakeGaps: Uint32Array;
  lastWakeAt: number;
  startedAt: number | null;
}

export interface Host {
  readonly seat: (
    socket: HostSocket,
    name: string,
    link: SeatLink,
    claim: SeatClaim
  ) => void;
  readonly message: (socket: HostSocket, data: string | ArrayBuffer) => void;
  readonly gone: (socket: HostSocket) => void;
  readonly status: () => RoomStatus;
}

const noteGap = (gaps: Uint32Array, gapMs: number): void => {
  let bucket = 0;
  while (
    bucket < WAKE_GAP_CEILINGS_MS.length &&
    gapMs > (WAKE_GAP_CEILINGS_MS[bucket] ?? gapMs)
  ) {
    bucket += 1;
  }
  gaps[bucket] = (gaps[bucket] ?? 0) + 1;
};

export const createHost = (
  ports: HostPorts,
  kind: RoomKind = "custom"
): Host => {
  const present = new Map<HostSocket, Present>();
  const walks = new Map<string, string>();
  const seats = new Map<HostSocket, Seat>();
  const reporting = new Map<HostSocket, { raceId: string; seat: Seat }>();
  const batch = createInputBatch();
  const tickBuffer = new ArrayBuffer(tickCapacity(MOST_SEATS));
  const tickView = new DataView(tickBuffer);
  const pongBuffer = new ArrayBuffer(PONG_PACKET_BYTES);
  const pongView = new DataView(pongBuffer);
  const readyDigest = new Uint32Array(HASH_WORDS);
  const bornAt = ports.now();
  const lobby = createLobby(bornAt, kind, () =>
    kind === "public" ? publicRuleFor(ports.seed()) : publicRoomRule
  );
  let running: Running | null = null;
  let wakes = 0;
  let catchUpWakes = 0;
  let worstBehindTicks = 0;
  let watching = false;

  const roomMs = (): number => ports.now() - bornAt;

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
    for (const socket of seats.keys()) {
      sendTo(socket, text);
    }
  };

  const tellWalkers = (from: HostSocket, text: string): void => {
    for (const person of present.values()) {
      if (
        person.socket !== from &&
        !seats.has(person.socket) &&
        !reporting.has(person.socket)
      ) {
        sendTo(person.socket, text);
      }
    }
  };

  const tellLobby = (): void => {
    const view = lobby.view(ports.now());
    for (const person of present.values()) {
      if (!seats.has(person.socket) && !reporting.has(person.socket)) {
        sendTo(
          person.socket,
          encodeRoomMessage({
            ...view,
            atMs: roomMs(),
            kind: "lobby",
            you: person.memberId,
          })
        );
      }
    }
  };

  const talliesOf = (room: Room | null): RoomStatus["seats"] =>
    [...seats.values()].flatMap((seat) => tallyOf(seat, room));

  const end = (run: Running): void => {
    const { raceId, room, tape, trace } = run;
    traceSeats(run.riders, run.room, run.trace);
    tape.finish();
    ports.saveTape(
      tapeKey(run.raceId, roomTraceName),
      JSON.stringify({ rows: trace } satisfies RoomTrace)
    );
    ports.saveTape(
      tapeKey(run.raceId, tapeEndName),
      JSON.stringify({ parts: tape.parts(), tick: room.state.tick })
    );
    ports.note({
      catchUpWakes,
      kind: "ended",
      raceId: run.raceId,
      seats: raceSeatsOf(run.riders, run.room),
      tick: room.state.tick,
      wakeGaps: [...run.wakeGaps],
      worstBehindTicks,
    });
    running = null;
    tell({ kind: "ended", tick: room.state.tick });
    const finished = [...seats.values()];
    for (const seat of finished) {
      reporting.set(seat.socket, { raceId, seat });
    }
    seats.clear();
    lobby.raceEnded(ports.now());
    tellLobby();
    ports.after(REPORT_GRACE_MS, () => {
      for (const seat of finished) {
        if (reporting.delete(seat.socket)) {
          seat.socket.close(SEAT_CLOSED, "The race is over.");
        }
      }
    });
  };

  const saveBrowserTrace = (seat: Seat, raceId: string, text: string): void => {
    if (seat.rider === null || seat.traced || text.length > MOST_TRACE_CHARS) {
      return;
    }
    seat.traced = true;
    const decoded = decodeBrowserTrace(text);
    if (Option.isNone(decoded)) {
      return;
    }
    const { build, gpu, graphics } = decoded.value;
    ports.note({
      build,
      gpu,
      graphics,
      kind: "browser",
      raceId,
      rider: seat.rider,
    });
    ports.saveTape(
      tapeKey(raceId, riderTraceName(seat.rider)),
      JSON.stringify(decoded.value)
    );
  };

  const noteStats = (seat: Seat, raceId: string, view: DataView): void => {
    const stats = readRaceStats(view);
    if (stats && !seat.reported && seat.rider !== null) {
      seat.reported = true;
      ports.note({ kind: "stats", raceId, rider: seat.rider, stats });
    }
  };

  const stepOnce = (run: Running): void => {
    const { room, tape } = run;
    room.step();
    if (room.state.tick % ROOM_TRACE_EVERY_TICKS === 0) {
      traceSeats(run.riders, run.room, run.trace);
    }
    const bytes = writeTick(
      tickView,
      room.frame,
      room.hashed ? room.hash : null
    );
    const packet = new Uint8Array(tickBuffer, 0, bytes);
    tape.add(packet);
    for (const socket of seats.keys()) {
      sendTo(socket, packet);
    }
  };

  const lagOf = (run: Running | null): number =>
    run === null || run.startedAt === null
      ? 0
      : Math.max(
          0,
          Math.floor((ports.now() - run.startedAt) / TICK_MS) -
            run.room.state.tick
        );

  const wake = (): void => {
    if (!running) {
      return;
    }
    const run = running;
    const { room, startedAt } = run;
    if (startedAt === null) {
      return;
    }
    wakes += 1;
    const now = ports.now();
    noteGap(run.wakeGaps, now - run.lastWakeAt);
    run.lastWakeAt = now;
    const behind = Math.floor((now - startedAt) / TICK_MS) - room.state.tick;
    worstBehindTicks = Math.max(worstBehindTicks, behind);
    if (behind > 1) {
      catchUpWakes += 1;
    }
    const steps = Math.min(behind, MOST_CATCH_UP_TICKS);
    for (let step = 0; step < steps; step += 1) {
      stepOnce(run);
      if (room.over()) {
        end(run);
        return;
      }
    }
    const nextAt = startedAt + (room.state.tick + 1) * TICK_MS;
    ports.after(
      behind > steps ? 0 : Math.max(1, Math.ceil(nextAt - ports.now())),
      wake
    );
  };

  const countDown = (run: Running): void => {
    if (run !== running || run.startedAt !== null) {
      return;
    }
    ports.note({
      kind: "countdown",
      raceId: run.raceId,
      stillLoading: run.riders.flatMap((seat) =>
        run.loading.has(seat.socket) && seat.rider !== null ? [seat.rider] : []
      ),
      waitedMs: ports.now() - run.since,
    });
    run.startedAt = ports.now() + START_DELAY_MS;
    run.lastWakeAt = run.startedAt;
    tell({ kind: "countdown", startAtMs: run.startedAt - bornAt });
    ports.after(START_DELAY_MS, wake);
  };

  const countDownOnceLoaded = (run: Running): void => {
    if (run.loading.size === 0) {
      countDown(run);
    }
  };

  const start = (): void => {
    walks.clear();
    for (const person of present.values()) {
      if (!reporting.has(person.socket)) {
        seats.set(
          person.socket,
          seatFor(person.socket, person.name, person.link)
        );
      }
    }
    if (seats.size === 0) {
      return;
    }
    const lobbyMs = ports.now() - lobby.since();
    const rule = lobby.rule();
    lobby.raceStarted();
    wakes = 0;
    catchUpWakes = 0;
    worstBehindTicks = 0;
    const seed = ports.seed();
    const raceId = ports.raceId();
    const { humans, road, setup } = seatedRace(seed, seats.size, rule);
    const room = createRoom(setup);
    const digest = hexOfWords(room.digest);
    ports.saveTape(
      tapeKey(raceId, tapeHeaderName),
      JSON.stringify({
        build: ports.build,
        digest,
        raceId,
        road,
        rule,
        seats: seats.size,
        seed,
        version: TAPE_VERSION,
      })
    );
    let at = 0;
    for (const seat of seats.values()) {
      const rider = humans[at];
      seat.rider = rider ?? null;
      at += 1;
    }
    const run: Running = {
      lastWakeAt: 0,
      loading: new Set(seats.keys()),
      raceId,
      riders: [...seats.values()],
      room,
      since: ports.now(),
      startedAt: null,
      tape: createTapeWriter(tickBuffer.byteLength, (part, bytes) => {
        ports.saveTape(tapeKey(raceId, tapePartName(part)), bytes);
      }),
      trace: [],
      wakeGaps: new Uint32Array(WAKE_GAP_CEILINGS_MS.length + 1),
    };
    running = run;
    const trackHash = trackDigest(setup.track);
    const racerIds = firstRacers(setup, Number.POSITIVE_INFINITY);
    const namesBySeat = new Map(
      [...seats.values()].map((seat) => [seat.rider, seat.name])
    );
    const manifest: RaceManifest = {
      build: ports.build,
      contentHash: [...room.digest],
      loadingDeadlineMs: READY_DEADLINE_MS,
      protocol: ROOM_PROTOCOL,
      raceId,
      reconnect: "none",
      roster: racerIds.flatMap((rider) => {
        const state = room.state.riders.find((each) => each.id === rider);
        const name = namesBySeat.get(rider) ?? null;
        return state
          ? [
              {
                bikeId: state.bike.id,
                kind: name === null ? ("ai" as const) : ("human" as const),
                name,
                rider,
              },
            ]
          : [];
      }),
      rule,
      seed,
      tickRate: Math.round(1 / TICK_SECONDS),
      trackHash: [...trackHash],
    };
    ports.note({
      at: ports.now(),
      build: ports.build,
      digest,
      kind: "started",
      lobbyMs,
      police: rule.police,
      protocol: ROOM_PROTOCOL,
      raceId,
      road,
      seats: humans.length,
      seed,
      tier: rule.tier,
      trackHash: hexOfWords(trackHash),
      traffic: rule.traffic,
    });
    for (const seat of seats.values()) {
      sendTo(
        seat.socket,
        encodeRoomMessage({
          kind: "started",
          manifest,
          you: seat.rider ?? 0,
        })
      );
    }
    ports.after(READY_DEADLINE_MS, () => {
      countDown(run);
    });
  };

  const refuse = (socket: HostSocket, reason: Refusal): void => {
    ports.note({ kind: "refused", reason });
    sendTo(socket, encodeRoomMessage({ kind: "refused", reason }));
    socket.close(SEAT_CLOSED, reason);
  };

  const leaveRace = (seat: Seat): void => {
    seats.delete(seat.socket);
    if (running && seat.rider !== null) {
      const { loading, raceId, room } = running;
      room.leave(seat.rider);
      seat.leftAtTick = room.state.tick;
      loading.delete(seat.socket);
      for (const tally of tallyOf(seat, room)) {
        ports.note({
          kind: "left",
          raceId,
          seatsLeft: seats.size,
          tally,
          tick: room.state.tick,
        });
      }
      countDownOnceLoaded(running);
    }
  };

  const retire = (socket: HostSocket): void => {
    present.delete(socket);
    reporting.delete(socket);
    const seat = seats.get(socket);
    if (seat) {
      leaveRace(seat);
    }
  };

  const consider = (): void => {
    if (!running && lobby.due(ports.now())) {
      start();
    }
  };

  const drop = ({ memberId, socket }: Present): void => {
    retire(socket);
    walks.delete(memberId);
    lobby.away(memberId, ports.now());
    tellLobby();
    consider();
  };

  const watchSeats = (): void => {
    const now = ports.now();
    for (const person of present.values()) {
      if (now - person.heardAt > SILENT_SEAT_MS) {
        if (person.heardAt !== SEND_FAILED) {
          person.socket.close(
            SEAT_SILENT,
            "The room stopped hearing this seat."
          );
        }
        drop(person);
      }
    }
    if (lobby.sweep(now)) {
      tellLobby();
    }
    consider();
    watching = present.size > 0 || lobby.size() > 0;
    if (watching) {
      ports.after(SEAT_WATCH_MS, watchSeats);
    }
  };

  const obey = ({ memberId, socket }: Present, command: LobbyCommand): void => {
    switch (command.kind) {
      case "walk": {
        const text = encodeRoomMessage({ ...command, member: memberId });
        walks.set(memberId, text);
        tellWalkers(socket, text);
        return;
      }
      case "act": {
        tellWalkers(socket, encodeRoomMessage({ ...command, from: memberId }));
        return;
      }
      case "ready": {
        lobby.ready(memberId, command.ready, command.edition, ports.now());
        break;
      }
      case "choose": {
        lobby.choose(memberId, command.choice);
        break;
      }
      default: {
        command satisfies never;
      }
    }
    tellLobby();
    consider();
  };

  return {
    gone: (socket) => {
      const person = present.get(socket);
      if (person) {
        drop(person);
      }
    },
    message: (socket, data) => {
      const late = reporting.get(socket);
      if (late) {
        if (data instanceof ArrayBuffer) {
          noteStats(late.seat, late.raceId, new DataView(data));
        } else {
          saveBrowserTrace(late.seat, late.raceId, data);
        }
        return;
      }
      const person = present.get(socket);
      if (!person) {
        return;
      }
      person.heardAt = ports.now();
      const seat = seats.get(socket);
      if (!(data instanceof ArrayBuffer)) {
        const command = decodeLobbyCommand(data);
        if (Option.isSome(command)) {
          obey(person, command.value);
        } else if (running && seat) {
          saveBrowserTrace(seat, running.raceId, data);
        }
        return;
      }
      const view = new DataView(data);
      if (readInput(view, batch)) {
        if (running && seat && seat.rider !== null) {
          const tally = running.room.accept(
            seat.rider,
            batch.firstTick,
            batch.controls
          );
          seat.accepted += tally.accepted;
          seat.ahead += tally.ahead;
          seat.late += tally.late;
        }
        return;
      }
      const stamp = readPing(view);
      if (stamp >= NO_STAMP) {
        const bytes = writePong(pongView, stamp, roomMs());
        sendTo(socket, new Uint8Array(pongBuffer, 0, bytes));
        return;
      }
      if (running && seat && readReady(view, readyDigest)) {
        if (hexOfWords(readyDigest) !== hexOfWords(running.room.digest)) {
          refuse(socket, "content");
          drop(person);
          return;
        }
        running.loading.delete(socket);
        seat.readyMs ??= ports.now() - running.since;
        countDownOnceLoaded(running);
        return;
      }
      if (running && seat) {
        noteStats(seat, running.raceId, view);
      }
    },
    seat: (socket, name, link, claim) => {
      if (claim.build !== ports.build || claim.protocol !== ROOM_PROTOCOL) {
        refuse(socket, "build");
        return;
      }
      const memberId = lobby.join(claim.key, name, ports.now());
      if (memberId === null) {
        refuse(socket, "full");
        return;
      }
      for (const person of present.values()) {
        if (person.memberId === memberId) {
          refuse(person.socket, "replaced");
          retire(person.socket);
        }
      }
      present.set(socket, {
        heardAt: ports.now(),
        link,
        memberId,
        name,
        socket,
      });
      if (!watching) {
        watching = true;
        ports.after(SEAT_WATCH_MS, watchSeats);
      }
      tellLobby();
      for (const [walker, text] of walks) {
        if (walker !== memberId) {
          sendTo(socket, text);
        }
      }
    },
    status: () => ({
      build: ports.build,
      catchUpWakes,
      lagTicks: lagOf(running),
      names: [...present.values()].map((person) => person.name),
      phase: running ? "racing" : "waiting",
      raceId: running?.raceId ?? null,
      rule: lobby.rule(),
      seats: talliesOf(running?.room ?? null),
      tick: running ? running.room.state.tick : 0,
      waiting: present.size,
      wakes,
      worstBehindTicks,
    }),
  };
};
