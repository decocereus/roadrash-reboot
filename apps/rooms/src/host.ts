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
import { hostAfter, NEW_HOST } from "./host-phase.ts";
import type { HostEvent, HostState } from "./host-phase.ts";
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
import {
  raceSeatsOf,
  rosterOf,
  seatFor,
  stillLoading,
  tallyOf,
  traceSeats,
} from "./race-seat.ts";
import type { Seat, SeatLink } from "./race-seat.ts";
import type { RoomKind } from "./room-id.ts";
import {
  BrowserTraceSchema,
  MOST_TRACE_CHARS,
  MOST_TRACE_ROW_VALUES,
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
  readonly roomColo: () => string | null;
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

interface Run {
  readonly raceId: string;
  readonly riders: readonly Seat[];
  readonly room: Room;
  readonly since: number;
  readonly tape: TapeWriter;
  readonly trace: number[];
  readonly wakeGaps: Uint32Array;
}

export interface Host {
  readonly seat: (
    socket: HostSocket,
    name: string,
    link: SeatLink,
    claim: SeatClaim
  ) => void;
  readonly message: (socket: HostSocket, data: string | ArrayBuffer) => void;
  readonly gone: (socket: HostSocket, closeCode: number | null) => void;
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

const keepBrowserRows = (seat: Seat, text: string): void => {
  if (text.length > MOST_TRACE_CHARS) {
    return;
  }
  const decoded = decodeBrowserTrace(text);
  if (Option.isNone(decoded)) {
    return;
  }
  const { rows, ...browser } = decoded.value;
  if (seat.traceRows.length + rows.length <= MOST_TRACE_ROW_VALUES) {
    seat.browser = browser;
    seat.traceRows.push(...rows);
  }
};

const keepStats = (seat: Seat, view: DataView): void => {
  const stats = readRaceStats(view);
  if (stats) {
    seat.reported = true;
    seat.stats = stats;
  }
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
  let state: HostState<Run> = NEW_HOST;
  let wakes = 0;
  let catchUpWakes = 0;
  let worstBehindTicks = 0;
  let watching = false;

  const roomMs = (): number => ports.now() - bornAt;

  const move = (event: HostEvent<Run>): boolean => {
    const next = hostAfter(state, event);
    if (next === null) {
      return false;
    }
    state = next;
    return true;
  };

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

  const settleReport = (seat: Seat, raceId: string): void => {
    const { browser, rider, stats, traceRows } = seat;
    if (rider === null) {
      return;
    }
    seat.browser = null;
    seat.stats = null;
    if (stats) {
      ports.note({ kind: "stats", raceId, rider, stats });
    }
    if (browser) {
      ports.note({ ...browser, kind: "browser", raceId, rider });
      ports.saveTape(
        tapeKey(raceId, riderTraceName(rider)),
        JSON.stringify({ ...browser, rows: traceRows })
      );
    }
  };

  const end = (run: Run): void => {
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
    move({ kind: "raceOver" });
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
          settleReport(seat, raceId);
          seat.socket.close(SEAT_CLOSED, "The race is over.");
        }
      }
    });
  };

  const stepOnce = (run: Run): void => {
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

  const ride = (run: Run, startedAt: number): void => {
    const { room, wakeGaps } = run;
    let lastWakeAt = startedAt;
    const wake = (): void => {
      wakes += 1;
      const now = ports.now();
      noteGap(wakeGaps, now - lastWakeAt);
      lastWakeAt = now;
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
    wake();
  };

  const countDown = (run: Run): void => {
    const now = ports.now();
    const startsAt = now + START_DELAY_MS;
    if (!move({ kind: "loadingOver", run, startsAt })) {
      return;
    }
    ports.note({
      kind: "countdown",
      raceId: run.raceId,
      stillLoading: stillLoading(run.riders),
      waitedMs: now - run.since,
    });
    tell({ kind: "countdown", startAtMs: startsAt - bornAt });
    ports.after(START_DELAY_MS, () => {
      move({ kind: "startMoment" });
      ride(run, startsAt);
    });
  };

  const countDownOnceLoaded = (run: Run): void => {
    if (stillLoading(run.riders).length === 0) {
      countDown(run);
    }
  };

  const start = (): void => {
    walks.clear();
    for (const person of present.values()) {
      if (!reporting.has(person.socket)) {
        seats.set(
          person.socket,
          seatFor(
            person.socket,
            person.name,
            lobby.colourOf(person.memberId),
            person.link
          )
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
    const run: Run = {
      raceId,
      riders: [...seats.values()],
      room,
      since: ports.now(),
      tape: createTapeWriter(tickBuffer.byteLength, (part, bytes) => {
        ports.saveTape(tapeKey(raceId, tapePartName(part)), bytes);
      }),
      trace: [],
      wakeGaps: new Uint32Array(WAKE_GAP_CEILINGS_MS.length + 1),
    };
    move({ kind: "raceBuilt", run });
    const trackHash = trackDigest(setup.track);
    const racerIds = firstRacers(setup, Number.POSITIVE_INFINITY);
    const manifest: RaceManifest = {
      build: ports.build,
      contentHash: [...room.digest],
      loadingDeadlineMs: READY_DEADLINE_MS,
      protocol: ROOM_PROTOCOL,
      raceId,
      reconnect: "none",
      roster: rosterOf(room, racerIds, [...seats.values()]),
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
      roomColo: ports.roomColo(),
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

  const leaveRace = (seat: Seat, closeCode: number | null): void => {
    seats.delete(seat.socket);
    const { run } = state;
    if (run && seat.rider !== null) {
      const { raceId, room } = run;
      room.leave(seat.rider);
      seat.leftAtTick = room.state.tick;
      for (const tally of tallyOf(seat, room)) {
        ports.note({
          closeCode,
          kind: "left",
          raceId,
          seatsLeft: seats.size,
          tally,
          tick: room.state.tick,
        });
      }
      settleReport(seat, raceId);
      countDownOnceLoaded(run);
    }
  };

  const retire = (socket: HostSocket, closeCode: number | null): void => {
    present.delete(socket);
    const late = reporting.get(socket);
    if (late) {
      reporting.delete(socket);
      settleReport(late.seat, late.raceId);
    }
    const seat = seats.get(socket);
    if (seat) {
      leaveRace(seat, closeCode);
    }
  };

  const consider = (): void => {
    if (state.phase === "waiting" && lobby.due(ports.now())) {
      start();
    }
  };

  const drop = (
    { memberId, socket }: Present,
    closeCode: number | null
  ): void => {
    retire(socket, closeCode);
    walks.delete(memberId);
    lobby.away(memberId, ports.now());
    tellLobby();
    consider();
  };

  const watchSeats = (): void => {
    const now = ports.now();
    for (const person of present.values()) {
      if (now - person.heardAt > SILENT_SEAT_MS) {
        const heard = person.heardAt !== SEND_FAILED;
        if (heard) {
          person.socket.close(
            SEAT_SILENT,
            "The room stopped hearing this seat."
          );
        }
        drop(person, heard ? SEAT_SILENT : null);
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
    gone: (socket, closeCode) => {
      const person = present.get(socket);
      if (person) {
        drop(person, closeCode);
      }
    },
    message: (socket, data) => {
      const late = reporting.get(socket);
      if (late) {
        if (data instanceof ArrayBuffer) {
          keepStats(late.seat, new DataView(data));
        } else {
          keepBrowserRows(late.seat, data);
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
        } else if (seat) {
          keepBrowserRows(seat, data);
        }
        return;
      }
      const { run } = state;
      const view = new DataView(data);
      if (readInput(view, batch)) {
        if (run && seat && seat.rider !== null) {
          const tally = run.room.accept(
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
      if (run && seat && readReady(view, readyDigest)) {
        if (hexOfWords(readyDigest) !== hexOfWords(run.room.digest)) {
          refuse(socket, "content");
          drop(person, SEAT_CLOSED);
          return;
        }
        seat.readyMs ??= ports.now() - run.since;
        countDownOnceLoaded(run);
        return;
      }
      if (seat) {
        keepStats(seat, view);
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
          retire(person.socket, SEAT_CLOSED);
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
    status: () => {
      const { phase, run } = state;
      return {
        build: ports.build,
        catchUpWakes,
        hostPhase: phase,
        lagTicks:
          state.phase === "racing"
            ? Math.max(
                0,
                Math.floor((ports.now() - state.startedAt) / TICK_MS) -
                  state.run.room.state.tick
              )
            : 0,
        names: [...present.values()].map((person) => person.name),
        phase: run ? "racing" : "waiting",
        raceId: run?.raceId ?? null,
        rule: lobby.rule(),
        seats: run
          ? [...seats.values()].flatMap((seat) => tallyOf(seat, run.room))
          : [],
        tick: run ? run.room.state.tick : 0,
        waiting: present.size,
        wakes,
        worstBehindTicks,
      };
    },
  };
};
