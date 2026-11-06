import type { CareerRaceSetup } from "@racer/career/field";
import { byGuest, seatedRace } from "@racer/career/room-race";
import type {
  GuestColours,
  GuestNames,
  RoomChoice,
} from "@racer/career/room-race";
import type { LobbyAct, LobbyWalk } from "@racer/sim/lobby-walk";
import { firstRacers, isDone } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import type { RoomClient } from "@racer/sim/room-client";
import { createRoomClock } from "@racer/sim/room-clock";
import { createTickFrame } from "@racer/sim/room-frame";
import {
  createReadTick,
  inputBytes,
  MOST_BATCHED_CONTROLS,
  PING_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  READY_PACKET_BYTES,
  readCatchUp,
  readPong,
  readTick,
  ROOM_PROTOCOL,
  writePing,
  writeRaceStats,
  writeReady,
} from "@racer/sim/room-wire";
import { setupDigest } from "@racer/sim/snapshot-setup";
import { riderIdAt } from "@racer/sim/state";
import type { Control, RiderId } from "@racer/sim/state";
import * as Option from "effect/Option";

import { humanColours, humanNames, seatedCount } from "./manifest.ts";
import {
  decodeRoomMessage,
  encodeLobbyCommand,
  SEAT_CLOSED,
  SEAT_LEFT,
  SEAT_QUIT,
} from "./messages.ts";
import type {
  LobbyCommand,
  Refusal,
  RoomActed,
  RoomLobbyMessage,
  RoomMessage,
  RoomStarted,
  RoomWalked,
} from "./messages.ts";
import { createRaceTally } from "./race-tally.ts";
import { ticksOf } from "./room-config.ts";
import type { BrowserTrace, SeatBrowser } from "./tape.ts";

const PING_EVERY_MS = 500;
const DEAD_AFTER_MS = 5000;
const MOST_UNANSWERED_PINGS = DEAD_AFTER_MS / PING_EVERY_MS;
const PINGS_PER_REPORT = 30;

export interface SeatRace {
  readonly awayMs: number | null;
  readonly client: RoomClient;
  readonly colours: GuestColours;
  readonly digest: Uint32Array;
  readonly holdSeconds: number;
  readonly me: RiderId;
  readonly names: GuestNames;
  readonly raceId: string;
  readonly riderColours: ReadonlyMap<RiderId, number>;
  readonly setup: CareerRaceSetup;
}

type LiveSeat =
  | {
      readonly phase: "connecting" | "lobby";
      readonly race: null;
      readonly refusal: null;
    }
  | {
      readonly phase: "loading" | "racing";
      readonly race: SeatRace;
      readonly refusal: null;
    };

type SeatState =
  | LiveSeat
  | {
      readonly phase: "ended";
      readonly race: SeatRace;
      readonly refusal: null;
    }
  | {
      readonly phase: "left" | "lost";
      readonly race: SeatRace | null;
      readonly refusal: null;
    }
  | {
      readonly phase: "lost";
      readonly race: SeatRace;
      readonly refusal: Refusal;
    }
  | {
      readonly phase: "refused";
      readonly race: null;
      readonly refusal: Refusal;
    };

export type SeatPhase = SeatState["phase"];

export type SeatEvent =
  | Exclude<RoomMessage, { readonly kind: "act" | "walk" }>
  | { readonly kind: "closed" | "silent" }
  | {
      readonly kind: "left";
      readonly code: typeof SEAT_LEFT | typeof SEAT_QUIT;
    };

export const NEW_SEAT: SeatState = {
  phase: "connecting",
  race: null,
  refusal: null,
};

const raceOf = ({ awayMs, manifest, you }: RoomStarted): SeatRace => {
  const { setup } = seatedRace(
    manifest.seed,
    seatedCount(manifest),
    manifest.rule
  );
  const me = riderIdAt(you);
  const client = createRoomClient(
    setup,
    me,
    ticksOf(manifest.raceLimitSeconds)
  );
  const colours = humanColours(manifest);
  return {
    awayMs,
    client,
    colours: byGuest(setup, me, colours),
    digest: setupDigest(client.confirmed, setup.track),
    holdSeconds: manifest.reconnect.holdSeconds,
    me,
    names: byGuest(setup, me, humanNames(manifest)),
    raceId: manifest.raceId,
    riderColours: new Map(
      firstRacers(setup, colours.length).flatMap((rider, at) => {
        const colour = colours[at];
        return colour === undefined ? [] : [[rider, colour] as const];
      })
    ),
    setup,
  };
};

const liveSeatAfter = (state: LiveSeat, event: SeatEvent): SeatState | null => {
  switch (event.kind) {
    case "lobby": {
      return state.race === null
        ? { phase: "lobby", race: null, refusal: null }
        : null;
    }
    case "started": {
      return state.race === null
        ? { phase: "loading", race: raceOf(event), refusal: null }
        : null;
    }
    case "countdown": {
      return state.phase === "loading"
        ? { phase: "racing", race: state.race, refusal: null }
        : null;
    }
    case "ended": {
      return state.phase === "racing"
        ? { phase: "ended", race: state.race, refusal: null }
        : null;
    }
    case "refused": {
      return state.race === null
        ? { phase: "refused", race: null, refusal: event.reason }
        : { phase: "lost", race: state.race, refusal: event.reason };
    }
    case "closed":
    case "silent": {
      return { phase: "lost", race: state.race, refusal: null };
    }
    case "left": {
      return { phase: "left", race: state.race, refusal: null };
    }
    default: {
      return event satisfies never;
    }
  }
};

export const seatAfter = (
  state: SeatState,
  event: SeatEvent
): SeatState | null => {
  switch (state.phase) {
    case "connecting":
    case "lobby":
    case "loading":
    case "racing": {
      return liveSeatAfter(state, event);
    }
    case "ended":
    case "left":
    case "lost":
    case "refused": {
      return null;
    }
    default: {
      return state satisfies never;
    }
  }
};

export interface SeatListeners {
  readonly onChange?: () => void;
  readonly onActed?: (acted: RoomActed) => void;
  readonly onConfirmed?: (client: RoomClient) => void;
  readonly onTickHeard?: (now: number, hashed: boolean) => void;
}

export interface RoomSeat {
  readonly closeCode: () => number | null;
  readonly flush: () => void;
  readonly frameDrawn: () => void;
  readonly leave: () => void;
  readonly leaveRoom: () => void;
  readonly listen: (next: SeatListeners) => void;
  readonly phase: () => SeatPhase;
  readonly race: () => SeatRace | null;
  readonly lobby: () => RoomLobbyMessage | null;
  readonly loaded: () => void;
  readonly reportNow: () => void;
  readonly choose: (choice: Partial<RoomChoice>) => void;
  readonly setReady: (ready: boolean) => void;
  readonly walk: (walk: LobbyWalk) => void;
  readonly walkOf: (member: string) => RoomWalked | undefined;
  readonly act: (act: LobbyAct, target: string) => void;
  readonly refusal: () => Refusal | null;
  readonly leadBloated: () => boolean;
  readonly rttMs: () => number;
  readonly worstRttMs: () => number;
  readonly startsInMs: () => number | null;
  readonly stepsDue: () => number;
  readonly target: () => number;
}

export const seatUrl = (
  roomsUrl: string,
  roomId: string,
  name: string,
  build: string,
  key: string,
  rejoin = true
): string =>
  `${roomsUrl.replace(/^http/u, "ws")}/rooms/${roomId}/seat?name=${encodeURIComponent(name)}&build=${encodeURIComponent(build)}&protocol=${ROOM_PROTOCOL}&key=${encodeURIComponent(key)}${rejoin ? "" : "&rejoin=no"}`;

export const openRoomSeat = (
  roomsUrl: string,
  roomId: string,
  name: string,
  build: string,
  key: string,
  browser: () => SeatBrowser | null,
  rejoin = true
): RoomSeat => {
  const socket = new WebSocket(
    seatUrl(roomsUrl, roomId, name, build, key, rejoin)
  );
  socket.binaryType = "arraybuffer";
  const read = createReadTick(createTickFrame());
  const pong = { roomMs: 0, stamp: 0 };
  const input = new DataView(
    new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS))
  );
  const ping = new DataView(new ArrayBuffer(PING_PACKET_BYTES));
  const clock = createRoomClock();
  const tally = createRaceTally();
  let reported = false;
  let pingsUntilReport = PINGS_PER_REPORT;
  let listeners: SeatListeners = {};
  let state: SeatState = NEW_SEAT;
  let lobby: RoomLobbyMessage | null = null;
  const walks = new Map<string, RoomWalked>();
  let lobbyHeardAt = 0;
  let closeCode: number | null = null;
  let rttMs = 0;
  let worstRttMs = 0;
  let unansweredPings = 0;
  let pings: ReturnType<typeof setInterval> | null = null;

  const stopPings = (): void => {
    if (pings) {
      clearInterval(pings);
      pings = null;
    }
  };

  const hangUp = (reason: string, code = SEAT_CLOSED): void => {
    stopPings();
    socket.close(code, reason);
  };

  const sendReport = ({ client }: SeatRace, rows: readonly number[]): void => {
    const packet = new DataView(new ArrayBuffer(RACE_STATS_PACKET_BYTES));
    writeRaceStats(packet, tally.read(client, worstRttMs));
    socket.send(packet.buffer);
    const identity = browser();
    if (identity) {
      const trace: BrowserTrace = { ...identity, rows };
      socket.send(JSON.stringify(trace));
    }
  };

  const reportWhileRiding = (): void => {
    pingsUntilReport -= 1;
    if (pingsUntilReport > 0 || reported || state.phase !== "racing") {
      return;
    }
    pingsUntilReport = PINGS_PER_REPORT;
    sendReport(state.race, tally.closedTraceRows());
  };

  const reportOnce = (): void => {
    const { race } = state;
    if (!race || reported || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    reported = true;
    race.client.settle();
    tally.frameDrawn(
      performance.now(),
      race.client.mine.s,
      race.client.confirmed.tick
    );
    sendReport(race, tally.lastTraceRows());
  };

  const enter = (event: SeatEvent): void => {
    switch (event.kind) {
      case "lobby": {
        lobby = event;
        lobbyHeardAt = performance.now();
        clock.heardRoomTime(event.atMs, lobbyHeardAt);
        break;
      }
      case "started": {
        break;
      }
      case "countdown": {
        clock.start(event.startAtMs);
        pingsUntilReport = PINGS_PER_REPORT;
        break;
      }
      case "ended": {
        reportOnce();
        hangUp("The race is over.");
        break;
      }
      case "refused": {
        hangUp("This seat was refused.");
        break;
      }
      case "silent": {
        hangUp("The room went silent.");
        break;
      }
      case "left": {
        reportOnce();
        hangUp("The rider left this seat.", event.code);
        break;
      }
      case "closed": {
        stopPings();
        break;
      }
      default: {
        event satisfies never;
      }
    }
  };

  const move = (event: SeatEvent): void => {
    const next = seatAfter(state, event);
    if (next) {
      state = next;
      enter(event);
      listeners.onChange?.();
    }
  };

  const sendPing = (): void => {
    const silent =
      state.phase === "racing"
        ? clock.silentMs(performance.now()) > DEAD_AFTER_MS
        : unansweredPings > MOST_UNANSWERED_PINGS;
    if (silent) {
      move({ kind: "silent" });
      return;
    }
    writePing(ping, Math.floor(performance.now()));
    socket.send(new Uint8Array(ping.buffer, 0, PING_PACKET_BYTES));
    unansweredPings += 1;
    reportWhileRiding();
  };

  const onBinary = (data: ArrayBuffer): void => {
    const view = new DataView(data);
    if (readPong(view, pong)) {
      unansweredPings = 0;
      const now = performance.now();
      rttMs = Math.floor(now) - pong.stamp;
      worstRttMs = Math.max(worstRttMs, rttMs);
      clock.heardRtt(rttMs, now);
      clock.heardRoomTime(pong.roomMs, now);
      tally.heardRtt(rttMs);
      return;
    }
    const { race } = state;
    const caughtUp = readCatchUp(view);
    if (race && caughtUp) {
      race.client.catchUp(caughtUp);
      listeners.onConfirmed?.(race.client);
      return;
    }
    if (race && readTick(view, read)) {
      const now = performance.now();
      clock.heardTick(read.frame.tick, now);
      tally.heardTick(now);
      listeners.onTickHeard?.(now, read.hashed);
      const lostBefore = race.client.lostControls();
      const predictedThrough = race.client.predicted.tick;
      race.client.confirm(read.frame, read.hashed ? read.hash : null);
      if (race.client.lostControls() > lostBefore) {
        clock.lostControl(read.frame.tick, predictedThrough, now);
      }
      listeners.onConfirmed?.(race.client);
    }
  };

  socket.addEventListener("open", () => {
    pings = setInterval(sendPing, PING_EVERY_MS);
  });

  socket.addEventListener("close", (event) => {
    closeCode = event.code;
    move({ kind: "closed" });
  });
  socket.addEventListener("message", (event) => {
    const data: unknown = event.data;
    if (data instanceof ArrayBuffer) {
      onBinary(data);
      return;
    }
    const message = decodeRoomMessage(data);
    if (Option.isNone(message)) {
      return;
    }
    switch (message.value.kind) {
      case "walk": {
        walks.set(message.value.member, message.value);
        break;
      }
      case "act": {
        listeners.onActed?.(message.value);
        break;
      }
      case "lobby":
      case "started":
      case "countdown":
      case "ended":
      case "refused": {
        move(message.value);
        break;
      }
      default: {
        message.value satisfies never;
      }
    }
  });

  const sendCommand = (command: LobbyCommand): void => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(encodeLobbyCommand(command));
    }
  };

  return {
    act: (act, target) => {
      sendCommand({ act, kind: "act", target });
    },
    choose: (choice) => {
      sendCommand({ choice, kind: "choose" });
    },
    closeCode: () => closeCode,
    flush: () => {
      const { race } = state;
      if (!race || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      for (
        let bytes = race.client.writeInputs(input);
        bytes > 0;
        bytes = race.client.writeInputs(input)
      ) {
        socket.send(new Uint8Array(input.buffer, 0, bytes));
      }
      if (isDone(race.client.mine)) {
        reportOnce();
      }
    },
    frameDrawn: () => {
      const { race } = state;
      if (race && race.client.predicted.tick > 0) {
        tally.frameDrawn(
          performance.now(),
          race.client.mine.s,
          race.client.confirmed.tick
        );
      }
    },
    leadBloated: () => {
      const { race } = state;
      return (
        race !== null &&
        clock.leadBloated(race.client.predicted.tick, performance.now())
      );
    },
    leave: () => {
      move({ code: SEAT_QUIT, kind: "left" });
    },
    leaveRoom: () => {
      move({ code: SEAT_LEFT, kind: "left" });
    },
    listen: (next) => {
      listeners = { ...listeners, ...next };
    },
    loaded: () => {
      if (state.race) {
        const packet = new DataView(new ArrayBuffer(READY_PACKET_BYTES));
        writeReady(packet, state.race.digest);
        socket.send(packet.buffer);
      }
    },
    lobby: () => lobby,
    phase: () => state.phase,
    race: () => state.race,
    refusal: () => state.refusal,
    reportNow: reportOnce,
    rttMs: () => rttMs,
    setReady: (ready) => {
      if (lobby) {
        sendCommand({ edition: lobby.edition, kind: "ready", ready });
      }
    },
    startsInMs: () =>
      lobby?.startsInMs === null || lobby === null
        ? null
        : lobby.startsInMs - (performance.now() - lobbyHeardAt),
    stepsDue: () => {
      const { race } = state;
      if (!race) {
        return 0;
      }
      race.client.settle();
      const { predicted } = race.client;
      const steps = clock.stepsDue(predicted.tick, performance.now());
      if (predicted.tick > 0) {
        tally.stepped(steps);
      }
      return steps;
    },
    target: () => clock.target(performance.now()),
    walk: (walk) => {
      sendCommand({ ...walk, kind: "walk" });
    },
    walkOf: (member) => walks.get(member),
    worstRttMs: () => worstRttMs,
  };
};

export const predictSteps = (
  seat: RoomSeat,
  controlFor: (tick: number) => Control
): number => {
  const race = seat.race();
  if (!race) {
    return 0;
  }
  let refused = 0;
  const steps = seat.stepsDue();
  for (let step = 0; step < steps; step += 1) {
    if (!race.client.predict(controlFor(race.client.predicted.tick + 1))) {
      refused += 1;
      break;
    }
  }
  seat.flush();
  return refused;
};
