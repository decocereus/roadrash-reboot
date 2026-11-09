import { MOST_SEATS } from "@racer/sim/room";
import { hexOfWords } from "@racer/sim/room-tape";
import {
  createInputBatch,
  readInput,
  readReady,
  ROOM_PROTOCOL,
  tickCapacity,
  writeCatchUp,
  writeTick,
} from "@racer/sim/room-wire";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { TICK_SECONDS } from "@racer/sim/state";
import * as Option from "effect/Option";

import type { RoomStatus } from "./contract.ts";
import { createPongs, watchForSilence } from "./heartbeat.ts";
import { hostAfter, NEW_HOST, startMomentOf } from "./host-phase.ts";
import type { HostEvent, HostState } from "./host-phase.ts";
import { createLobby } from "./lobby.ts";
import {
  decodeLobbyCommand,
  encodeRoomMessage,
  SEAT_CLOSED,
  SEAT_FLOODED,
  SEAT_LEFT,
  SEAT_QUIT,
  SEAT_SILENT,
} from "./messages.ts";
import type { LobbyCommand, Refusal, RoomMessage } from "./messages.ts";
import { noteGap } from "./notes.ts";
import { buildRace, finishTape } from "./race-build.ts";
import type { RacePorts, Run } from "./race-build.ts";
import {
  HERE,
  keepBrowserRows,
  keepReport,
  keepStats,
  raceSeatsOf,
  settleReport,
  stillLoading,
  tallyOf,
  traceSeats,
} from "./race-seat.ts";
import type { Seat, SeatHold, SeatLink } from "./race-seat.ts";
import { msOf, publicRuleFor } from "./room-config.ts";
import type { RoomKind } from "./room-id.ts";
import { createSocketBudget, CUT_AFTER_DROPS, spend } from "./socket-budget.ts";
import type { SocketBudget } from "./socket-budget.ts";
import { IN_THE_LOBBY, roleAfter } from "./socket-role.ts";
import type { SocketEvent, SocketRole } from "./socket-role.ts";
import { ROOM_TRACE_EVERY_TICKS } from "./tape.ts";

const TICK_MS = TICK_SECONDS * 1000;
const MOST_CATCH_UP_TICKS = 4;
const START_DELAY_MS = 3000;
const REPORT_GRACE_MS = 5000;
const SEND_FAILED = Number.NEGATIVE_INFINITY;

export interface HostSocket {
  readonly send: (data: string | ArrayBufferView) => void;
  readonly close: (code: number, reason: string) => void;
}

export interface SeatClaim {
  readonly build: string;
  readonly key: string;
  readonly protocol: number;
  readonly rejoin: boolean;
}

export interface HostPorts extends RacePorts {
  readonly now: () => number;
  readonly after: (ms: number, wake: () => void) => void;
}

interface Present {
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

type Parting = "hold" | "leave";

const partingOf = (closeCode: number | null): Parting =>
  closeCode === SEAT_LEFT || closeCode === SEAT_QUIT ? "leave" : "hold";

const moveSocket = (person: Present, event: SocketEvent<Run, Seat>): void => {
  person.role = roleAfter(person.role, event) ?? person.role;
};

export const createHost = (
  ports: HostPorts,
  kind: RoomKind = "custom"
): Host => {
  const present = new Map<HostSocket, Present>();
  const batch = createInputBatch();
  const tickBuffer = new ArrayBuffer(tickCapacity(MOST_SEATS));
  const tickView = new DataView(tickBuffer);
  const readyDigest = new Uint32Array(HASH_WORDS);
  const bornAt = ports.now();
  const { publicRace } = ports.config;
  const lobby = createLobby(bornAt, kind, ports.config, () =>
    publicRuleFor(publicRace, kind === "public" ? ports.seed() : 0)
  );
  let state: HostState<Run> = NEW_HOST;
  let roundTripsMoved = false;
  let wakes = 0;
  let catchUpWakes = 0;
  let worstBehindTicks = 0;
  let dropped = 0;

  const roomMs = (): number => ports.now() - bornAt;
  const pongFor = createPongs(roomMs);

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

  const tellLobby = (): void => {
    roundTripsMoved = false;
    const view = lobby.view(ports.now());
    for (const { memberId, role, socket } of present.values()) {
      if (role.kind === "lobby") {
        sendTo(
          socket,
          encodeRoomMessage({
            ...view,
            atMs: roomMs(),
            kind: "lobby",
            seatHoldSeconds: ports.config.seatHoldSeconds,
            you: memberId,
          })
        );
      }
    }
  };

  const end = (run: Run): void => {
    const { room } = run;
    finishTape(run, ports.saveTape);
    ports.note({
      catchUpWakes,
      dropped,
      kind: "ended",
      raceId: run.raceId,
      seats: raceSeatsOf(run.riders, run.room),
      tick: room.state.tick,
      wakeGaps: [...run.wakeGaps],
      worstBehindTicks,
    });
    move({ kind: "raceOver" });
    tell({ kind: "ended", tick: room.state.tick });
    for (const person of present.values()) {
      moveSocket(person, { kind: "raceOver" });
    }
    lobby.raceEnded(ports.now());
    tellLobby();
    ports.after(REPORT_GRACE_MS, () => {
      for (const person of present.values()) {
        const { role } = person;
        if (role.kind === "reporting") {
          moveSocket(person, { kind: "graceOver" });
          settleReport(role.seat, ports);
          person.socket.close(SEAT_CLOSED, "The race is over.");
        }
      }
    });
  };

  const stepOnce = (run: Run): void => {
    const { room, tape } = run;
    room.step();
    if (room.state.tick % ROOM_TRACE_EVERY_TICKS === 0) {
      traceSeats(run.riders, room, run.trace);
    }
    const bytes = writeTick(
      tickView,
      room.frame,
      room.hashed ? room.hash : null
    );
    const packet = new Uint8Array(tickBuffer, 0, bytes);
    tape.add(packet);
    for (const { role, socket } of present.values()) {
      if (role.kind === "seated") {
        sendTo(socket, packet);
      }
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
    const gathered = [...present.values()].filter(
      ({ role }) => role.kind === "lobby"
    );
    const lobbyMs = ports.now() - lobby.since();
    const rule = lobby.rule();
    lobby.raceStarted();
    wakes = 0;
    catchUpWakes = 0;
    worstBehindTicks = 0;
    dropped = 0;
    const { run, seated } = buildRace(ports, {
      colourOf: lobby.colourOf,
      gathered,
      lobbyMs,
      now: ports.now(),
      rule,
      tickBytes: tickBuffer.byteLength,
    });
    move({ kind: "raceBuilt", run });
    for (const { person, seat } of seated) {
      person.walk = null;
      moveSocket(person, { kind: "raceBuilt", run, seat });
    }
    for (const { person, seat } of seated) {
      sendTo(
        person.socket,
        encodeRoomMessage({
          awayMs: null,
          kind: "started",
          manifest: run.manifest,
          you: seat.rider,
        })
      );
    }
    ports.after(msOf(ports.config.loadDeadlineSeconds), () => {
      countDown(run);
    });
  };

  const refuse = (
    socket: HostSocket,
    reason: Refusal,
    closeCode = SEAT_CLOSED
  ): void => {
    ports.note({ kind: "refused", reason });
    sendTo(socket, encodeRoomMessage({ kind: "refused", reason }));
    socket.close(closeCode, reason);
  };

  const inRace = () =>
    [...present.values()].flatMap(({ role }) =>
      role.kind === "seated" ? [role] : []
    );

  const leaveRace = (run: Run, seat: Seat, closeCode: number | null): void => {
    if (seat.presence.kind === "left") {
      return;
    }
    const { raceId, room } = run;
    room.leave(seat.rider);
    seat.presence = { kind: "left", tick: room.state.tick };
    ports.note({
      closeCode,
      kind: "left",
      raceId,
      seatsLeft: inRace().length,
      tally: tallyOf(seat, room),
      tick: room.state.tick,
    });
    settleReport(seat, ports);
    countDownOnceLoaded(run);
  };

  const holdRunsOut = (run: Run, seat: Seat, hold: SeatHold): void => {
    if (state.run === run && seat.presence === hold) {
      leaveRace(run, seat, hold.closeCode);
    }
  };

  const holdSeat = (run: Run, seat: Seat, closeCode: number | null): void => {
    if (seat.presence.kind !== "here") {
      return;
    }
    const since = ports.now();
    const hold: SeatHold = {
      closeCode,
      kind: "held",
      since,
      until: since + msOf(ports.config.seatHoldSeconds),
    };
    seat.presence = hold;
    ports.note({
      closeCode,
      kind: "held",
      raceId: run.raceId,
      rider: seat.rider,
      tick: run.room.state.tick,
    });
    settleReport(seat, ports);
    countDownOnceLoaded(run);
    ports.after(hold.until - since, () => {
      holdRunsOut(run, seat, hold);
    });
  };

  const retire = (
    { role, socket }: Present,
    closeCode: number | null,
    parting: Parting
  ): void => {
    present.delete(socket);
    switch (role.kind) {
      case "lobby": {
        return;
      }
      case "seated": {
        const part = parting === "hold" ? holdSeat : leaveRace;
        part(role.run, role.seat, closeCode);
        return;
      }
      case "reporting": {
        settleReport(role.seat, ports);
        return;
      }
      default: {
        role satisfies never;
      }
    }
  };

  const consider = (): void => {
    if (state.phase === "waiting" && lobby.due(ports.now())) {
      start();
    }
  };

  const claimHold = (memberId: string) => {
    const { run } = state;
    for (const seat of run?.riders ?? []) {
      const { presence } = seat;
      if (run && seat.memberId === memberId && presence.kind === "held") {
        if (ports.now() < presence.until) {
          return { run, seat, since: presence.since };
        }
        holdRunsOut(run, seat, presence);
      }
    }
    return null;
  };

  const rejoin = (person: Present, run: Run, seat: Seat, at: number): void => {
    const awayMs = ports.now() - at;
    seat.presence = HERE;
    if (state.phase === "loading") {
      seat.readyMs = null;
    }
    moveSocket(person, { kind: "rejoined", run, seat });
    sendTo(
      person.socket,
      encodeRoomMessage({
        awayMs,
        kind: "started",
        manifest: run.manifest,
        you: seat.rider,
      })
    );
    sendTo(person.socket, writeCatchUp(run.room.snapshot()));
    const startAt = startMomentOf(state);
    if (startAt !== null) {
      sendTo(
        person.socket,
        encodeRoomMessage({ kind: "countdown", startAtMs: startAt - bornAt })
      );
    }
    ports.note({
      awayMs,
      catchUpTicks: run.room.state.tick,
      kind: "rejoined",
      raceId: run.raceId,
      rider: seat.rider,
    });
  };

  const drop = (
    person: Present,
    closeCode: number | null,
    parting: Parting = partingOf(closeCode)
  ): void => {
    retire(person, closeCode, parting);
    const part = closeCode === SEAT_LEFT ? lobby.leave : lobby.away;
    part(person.memberId, ports.now());
    tellLobby();
    consider();
  };

  const watchSeats = watchForSilence(ports, {
    heard: () => present.values(),
    onSilent: (person) => {
      const heard = person.heardAt !== SEND_FAILED;
      if (heard) {
        person.socket.close(SEAT_SILENT, "The room stopped hearing this seat.");
      }
      drop(person, heard ? SEAT_SILENT : null);
    },
    onSwept: (now) => {
      if (lobby.sweep(now) || roundTripsMoved) {
        tellLobby();
      }
      consider();
      return present.size > 0 || lobby.size() > 0;
    },
  });

  const obey = (person: Present, command: LobbyCommand): void => {
    const { memberId, socket } = person;
    switch (command.kind) {
      case "walk": {
        const text = encodeRoomMessage({ ...command, member: memberId });
        person.walk = text;
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

  const answerPing = (person: Present, view: DataView): boolean => {
    const answer = pongFor(view);
    if (answer === null) {
      return false;
    }
    if (lobby.roundTrip(person.memberId, answer.rttMs)) {
      roundTripsMoved = true;
    }
    sendTo(person.socket, answer.pong);
    return true;
  };

  const hearLobby = (person: Present, data: string | ArrayBuffer): void => {
    person.heardAt = ports.now();
    if (data instanceof ArrayBuffer) {
      answerPing(person, new DataView(data));
      return;
    }
    const command = decodeLobbyCommand(data);
    if (Option.isSome(command)) {
      obey(person, command.value);
    }
  };

  const hearRider = (
    person: Present,
    run: Run,
    seat: Seat,
    data: string | ArrayBuffer
  ): void => {
    person.heardAt = ports.now();
    if (!(data instanceof ArrayBuffer)) {
      const command = decodeLobbyCommand(data);
      if (Option.isSome(command)) {
        obey(person, command.value);
      } else {
        keepBrowserRows(seat, data);
      }
      return;
    }
    const view = new DataView(data);
    if (readInput(view, batch)) {
      const tally = run.room.accept(
        seat.rider,
        batch.firstTick,
        batch.controls
      );
      seat.accepted += tally.accepted;
      seat.ahead += tally.ahead;
      seat.late += tally.late;
      return;
    }
    if (answerPing(person, view)) {
      return;
    }
    if (!readReady(view, readyDigest)) {
      keepStats(seat, view);
      return;
    }
    if (hexOfWords(readyDigest) !== hexOfWords(run.room.digest)) {
      refuse(person.socket, "content");
      drop(person, SEAT_CLOSED, "leave");
      return;
    }
    seat.readyMs ??= ports.now() - run.since;
    countDownOnceLoaded(run);
  };

  return {
    gone: (socket, closeCode) => {
      const person = present.get(socket);
      if (person) {
        drop(person, closeCode);
      }
    },
    message: (socket, data) => {
      const person = present.get(socket);
      if (!person) {
        return;
      }
      if (!spend(person.budget, data, ports.now())) {
        dropped += 1;
        if (person.budget.dropped >= CUT_AFTER_DROPS) {
          refuse(socket, "flooded", SEAT_FLOODED);
          drop(person, SEAT_FLOODED, "leave");
        }
        return;
      }
      if (!person.arrived) {
        person.arrived = true;
        lobby.arrive(person.memberId);
      }
      const { role } = person;
      switch (role.kind) {
        case "lobby": {
          hearLobby(person, data);
          return;
        }
        case "seated": {
          hearRider(person, role.run, role.seat, data);
          return;
        }
        case "reporting": {
          keepReport(role.seat, data);
          return;
        }
        default: {
          role satisfies never;
        }
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
      const replaced = [...present.values()].find(
        (person) => person.memberId === memberId
      );
      if (replaced) {
        refuse(replaced.socket, "replaced");
        retire(replaced, SEAT_CLOSED, "hold");
      }
      const person: Present = {
        arrived: false,
        budget: createSocketBudget(ports.now()),
        heardAt: ports.now(),
        link,
        memberId,
        name,
        role: IN_THE_LOBBY,
        socket,
        walk: replaced?.walk ?? null,
      };
      present.set(socket, person);
      const held = claimHold(memberId);
      if (held && claim.rejoin) {
        rejoin(person, held.run, held.seat, held.since);
      } else if (held) {
        leaveRace(held.run, held.seat, SEAT_QUIT);
      }
      watchSeats();
      tellLobby();
      for (const other of present.values()) {
        if (other.socket !== socket && other.walk !== null) {
          sendTo(socket, other.walk);
        }
      }
    },
    status: () => {
      const { phase, run } = state;
      return {
        build: ports.build,
        catchUpWakes,
        dropped,
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
        roles: [...present.values()].map(({ role }) => role.kind),
        rule: lobby.rule(),
        seats: inRace().map((role) => tallyOf(role.seat, role.run.room)),
        tick: run ? run.room.state.tick : 0,
        waiting: present.size,
        wakes,
        worstBehindTicks,
      };
    },
  };
};
