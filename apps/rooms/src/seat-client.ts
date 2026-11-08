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
  RACE_STATS_PACKET_BYTES,
  READY_PACKET_BYTES,
  readCatchUp,
  readTick,
  ROOM_PROTOCOL,
  writeRaceStats,
  writeReady,
} from "@racer/sim/room-wire";
import { setupDigest } from "@racer/sim/snapshot-setup";
import { riderIdAt } from "@racer/sim/state";
import type { Control, RiderId } from "@racer/sim/state";
import * as Option from "effect/Option";

import { createPings, DEAD_AFTER_MS } from "./heartbeat.ts";
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

const PINGS_PER_REPORT = 30;

export const MOST_TICKS_PER_FRAME = 60;

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

export interface SeatTrace {
  readonly browser: () => SeatBrowser;
  readonly sharing: () => boolean;
  readonly watch: (turned: (sharing: boolean) => void) => () => void;
}

export interface SeatListeners {
  readonly onChange?: () => void;
  readonly onOpen?: () => void;
  readonly onActed?: (acted: RoomActed) => void;
  readonly onConfirmed?: (client: RoomClient) => void;
  readonly onTickHeard?: (now: number, hashed: boolean) => void;
}

export interface RoomSeat {
  readonly closeCode: () => number | null;
  readonly flush: () => void;
  readonly frameDrawn: (ownOffMetres: number, rivalOffMetres: number) => void;
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
  readonly pace: () => number;
  readonly startsInMs: () => number | null;
  readonly stepsDue: () => number;
  readonly stoppedDrawing: () => void;
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
  trace: SeatTrace | null,
  rejoin = true
): RoomSeat => {
  const socket = new WebSocket(
    seatUrl(roomsUrl, roomId, name, build, key, rejoin)
  );
  socket.binaryType = "arraybuffer";
  const read = createReadTick(createTickFrame());
  const backlog: ArrayBuffer[] = [];
  let drawing = false;
  let frameLeft = MOST_TICKS_PER_FRAME;
  const input = new DataView(
    new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS))
  );
  const pings = createPings(socket);
  const clock = createRoomClock();
  const tally = createRaceTally(trace?.sharing() ?? false);
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

  const sendTrace = (rows: readonly number[] | null): void => {
    if (trace && rows) {
      const sent: BrowserTrace = { ...trace.browser(), rows };
      socket.send(JSON.stringify(sent));
    }
  };

  const sendReport = (
    { client }: SeatRace,
    rows: readonly number[] | null
  ): void => {
    const packet = new DataView(new ArrayBuffer(RACE_STATS_PACKET_BYTES));
    writeRaceStats(packet, tally.read(client, worstRttMs));
    socket.send(packet.buffer);
    sendTrace(rows);
  };

  const stopWatching = trace?.watch((sharing) => {
    if (sharing) {
      tally.traceOn(performance.now());
      return;
    }
    const rows = tally.traceOff();
    if (state.phase === "racing" && !reported) {
      sendTrace(rows);
    }
  });

  const standDown = (): void => {
    stopWatching?.();
    pings.stop();
  };

  const hangUp = (reason: string, code = SEAT_CLOSED): void => {
    standDown();
    socket.close(code, reason);
  };

  const confirmRead = (race: SeatRace, now: number): void => {
    frameLeft -= 1;
    const lostBefore = race.client.lostControls();
    const predictedThrough = race.client.predicted.tick;
    race.client.confirm(read.frame, read.hashed ? read.hash : null);
    if (race.client.lostControls() > lostBefore) {
      clock.lostControl(read.frame.tick, predictedThrough, now);
    }
    listeners.onConfirmed?.(race.client);
  };

  const nextHeld = (all: boolean): ArrayBuffer | undefined =>
    all || frameLeft > 0 ? backlog.shift() : undefined;

  const confirmHeld = (race: SeatRace, all: boolean): void => {
    for (let data = nextHeld(all); data; data = nextHeld(all)) {
      if (readTick(new DataView(data), read)) {
        confirmRead(race, performance.now());
      }
    }
  };

  const catchUpWork = (race: SeatRace): void => {
    const all = !drawing;
    confirmHeld(race, all);
    frameLeft -= race.client.settle(
      all ? Number.POSITIVE_INFINITY : Math.max(0, frameLeft)
    );
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
    confirmHeld(race, true);
    race.client.settle();
    tally.frameDrawn(
      performance.now(),
      race.client.mine.s,
      race.client.confirmed.tick,
      1,
      0,
      0,
      race.client.stats.resimulatedTicks
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
        standDown();
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

  const onBinary = (data: ArrayBuffer): void => {
    const view = new DataView(data);
    const pong = pings.hear(view);
    if (pong) {
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
      backlog.length = 0;
      race.client.catchUp(caughtUp);
      listeners.onConfirmed?.(race.client);
      return;
    }
    if (race && readTick(view, read)) {
      const now = performance.now();
      clock.heardTick(read.frame.tick, now);
      tally.heardTick(now);
      listeners.onTickHeard?.(now, read.hashed);
      if (backlog.length === 0 && (frameLeft > 0 || !drawing)) {
        confirmRead(race, now);
        return;
      }
      backlog.push(data);
      if (!drawing) {
        confirmHeld(race, true);
      }
    }
  };

  socket.addEventListener("open", () => {
    pings.start({
      onPinged: reportWhileRiding,
      onSilent: () => {
        move({ kind: "silent" });
      },
      silent: (pongsStopped) =>
        state.phase === "racing"
          ? clock.silentMs(performance.now()) > DEAD_AFTER_MS
          : pongsStopped,
    });
    listeners.onOpen?.();
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
      if (
        isDone(race.client.mine) &&
        backlog.length === 0 &&
        !race.client.mending()
      ) {
        reportOnce();
      }
    },
    frameDrawn: (ownOffMetres, rivalOffMetres) => {
      drawing = true;
      frameLeft = MOST_TICKS_PER_FRAME;
      const { race } = state;
      if (race && race.client.predicted.tick > 0) {
        const now = performance.now();
        tally.frameDrawn(
          now,
          race.client.mine.s,
          race.client.confirmed.tick,
          clock.pace(
            race.client.predicted.tick,
            race.client.confirmed.tick,
            now
          ),
          ownOffMetres,
          rivalOffMetres,
          race.client.stats.resimulatedTicks
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
    pace: () => {
      const { race } = state;
      return race
        ? clock.pace(
            race.client.predicted.tick,
            race.client.confirmed.tick,
            performance.now()
          )
        : 1;
    },
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
      catchUpWork(race);
      const { confirmed, predicted } = race.client;
      return clock.stepsDue(predicted.tick, confirmed.tick, performance.now());
    },
    stoppedDrawing: () => {
      drawing = false;
      const { race } = state;
      if (race) {
        confirmHeld(race, true);
      }
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
  while (race.client.predicted.tick < seat.target() && seat.stepsDue() > 0) {
    if (!race.client.predict(controlFor(race.client.predicted.tick + 1))) {
      refused += 1;
      break;
    }
  }
  seat.flush();
  return refused;
};
