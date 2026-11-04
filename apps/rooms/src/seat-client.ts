import type { CareerRaceSetup } from "@racer/career/field";
import { guestNames, seatedRace } from "@racer/career/room-race";
import type { GuestNames } from "@racer/career/room-race";
import { isDone } from "@racer/sim/room";
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

import { humanNames, seatedCount } from "./manifest.ts";
import { decodeRoomMessage, SEAT_CLOSED } from "./messages.ts";
import type { Refusal, RoomStarted } from "./messages.ts";
import { createRaceTally } from "./race-tally.ts";
import type { BrowserTrace, SeatBrowser } from "./tape.ts";

const PING_EVERY_MS = 500;
const DEAD_AFTER_MS = 5000;
const MOST_UNANSWERED_PINGS = DEAD_AFTER_MS / PING_EVERY_MS;

export type SeatPhase =
  | "connecting"
  | "ended"
  | "left"
  | "loading"
  | "lobby"
  | "lost"
  | "racing"
  | "refused";

export interface SeatRace {
  readonly client: RoomClient;
  readonly me: RiderId;
  readonly names: GuestNames;
  readonly raceId: string;
  readonly setup: CareerRaceSetup;
}

export interface SeatListeners {
  readonly onChange?: () => void;
  readonly onConfirmed?: (client: RoomClient) => void;
  readonly onTickHeard?: (now: number, hashed: boolean) => void;
}

export interface RoomSeat {
  readonly closeCode: () => number | null;
  readonly flush: () => void;
  readonly frameDrawn: () => void;
  readonly leave: () => void;
  readonly listen: (next: SeatListeners) => void;
  readonly phase: () => SeatPhase;
  readonly race: () => SeatRace | null;
  readonly ready: () => void;
  readonly refusal: () => Refusal | null;
  readonly riders: () => number;
  readonly riderNames: () => readonly string[];
  readonly rttMs: () => number;
  readonly worstRttMs: () => number;
  readonly startsInMs: () => number;
  readonly stepsDue: () => number;
  readonly target: () => number;
}

export const seatUrl = (
  roomsUrl: string,
  roomId: string,
  name: string,
  build: string
): string =>
  `${roomsUrl.replace(/^http/u, "ws")}/rooms/${roomId}/seat?name=${encodeURIComponent(name)}&build=${encodeURIComponent(build)}&protocol=${ROOM_PROTOCOL}`;

export const openRoomSeat = (
  roomsUrl: string,
  roomId: string,
  name: string,
  build: string,
  browser: () => SeatBrowser | null
): RoomSeat => {
  const socket = new WebSocket(seatUrl(roomsUrl, roomId, name, build));
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
  let listeners: SeatListeners = {};
  let phase: SeatPhase = "connecting";
  let riders = 0;
  let riderNames: readonly string[] = [];
  let counting = false;
  let lobbyEndsAt = 0;
  let race: SeatRace | null = null;
  let refused: Refusal | null = null;
  let digest: Uint32Array = new Uint32Array();
  let closeCode: number | null = null;
  let rttMs = 0;
  let worstRttMs = 0;
  let unansweredPings = 0;
  let pings: ReturnType<typeof setInterval> | null = null;

  const move = (next: SeatPhase): void => {
    phase = next;
    listeners.onChange?.();
  };

  const stopPings = (): void => {
    if (pings) {
      clearInterval(pings);
      pings = null;
    }
  };

  const onStarted = ({ manifest, you }: RoomStarted): void => {
    const { setup } = seatedRace(
      manifest.seed,
      seatedCount(manifest),
      manifest.rule
    );
    const me = riderIdAt(you);
    const client = createRoomClient(setup, me);
    digest = setupDigest(client.confirmed, setup.track);
    race = {
      client,
      me,
      names: guestNames(setup, me, humanNames(manifest)),
      raceId: manifest.raceId,
      setup,
    };
    move("loading");
  };

  const sendPing = (): void => {
    const silent = counting
      ? clock.silentMs(performance.now()) > DEAD_AFTER_MS
      : unansweredPings > MOST_UNANSWERED_PINGS;
    if (silent) {
      stopPings();
      socket.close(SEAT_CLOSED, "The room went silent.");
      move("lost");
      return;
    }
    writePing(ping, Math.floor(performance.now()));
    socket.send(new Uint8Array(ping.buffer, 0, PING_PACKET_BYTES));
    unansweredPings += 1;
  };

  const onBinary = (data: ArrayBuffer): void => {
    const view = new DataView(data);
    if (readPong(view, pong)) {
      unansweredPings = 0;
      const now = performance.now();
      rttMs = Math.floor(now) - pong.stamp;
      worstRttMs = Math.max(worstRttMs, rttMs);
      clock.heardRtt(rttMs);
      clock.heardRoomTime(pong.roomMs, now);
      tally.heardRtt(rttMs);
      return;
    }
    if (race && readTick(view, read)) {
      const now = performance.now();
      clock.heardTick(read.frame.tick, now);
      tally.heardTick(now);
      listeners.onTickHeard?.(now, read.hashed);
      race.client.confirm(read.frame, read.hashed ? read.hash : null);
      listeners.onConfirmed?.(race.client);
    }
  };

  socket.addEventListener("open", () => {
    pings = setInterval(sendPing, PING_EVERY_MS);
  });
  const reportOnce = (): void => {
    if (!race || reported || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    reported = true;
    tally.frameDrawn(
      performance.now(),
      race.client.mine.s,
      race.client.confirmed.tick
    );
    const packet = new DataView(new ArrayBuffer(RACE_STATS_PACKET_BYTES));
    writeRaceStats(packet, tally.read(race.client, worstRttMs));
    socket.send(packet.buffer);
    const identity = browser();
    if (identity) {
      const trace: BrowserTrace = { ...identity, rows: tally.traceRows() };
      socket.send(JSON.stringify(trace));
    }
  };

  socket.addEventListener("close", (event) => {
    closeCode = event.code;
    stopPings();
    if (
      phase === "connecting" ||
      phase === "lobby" ||
      phase === "loading" ||
      phase === "racing"
    ) {
      move("lost");
    }
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
      case "lobby": {
        ({ names: riderNames, riders } = message.value);
        clock.heardRoomTime(message.value.atMs, performance.now());
        lobbyEndsAt = performance.now() + message.value.startsInMs;
        move("lobby");
        break;
      }
      case "started": {
        onStarted(message.value);
        break;
      }
      case "countdown": {
        clock.start(message.value.startAtMs);
        counting = true;
        move("racing");
        break;
      }
      case "ended": {
        reportOnce();
        stopPings();
        socket.close(SEAT_CLOSED, "The race is over.");
        move("ended");
        break;
      }
      case "refused": {
        refused = message.value.reason;
        socket.close(SEAT_CLOSED, "This seat was refused.");
        move("refused");
        break;
      }
      default: {
        message.value satisfies never;
      }
    }
  });

  return {
    closeCode: () => closeCode,
    flush: () => {
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
      if (race && race.client.predicted.tick > 0) {
        tally.frameDrawn(
          performance.now(),
          race.client.mine.s,
          race.client.confirmed.tick
        );
      }
    },
    leave: () => {
      reportOnce();
      stopPings();
      phase = "left";
      socket.close(SEAT_CLOSED, "The rider left this seat.");
    },
    listen: (next) => {
      listeners = { ...listeners, ...next };
    },
    phase: () => phase,
    race: () => race,
    ready: () => {
      const packet = new DataView(new ArrayBuffer(READY_PACKET_BYTES));
      writeReady(packet, digest);
      socket.send(packet.buffer);
    },
    refusal: () => refused,
    riderNames: () => riderNames,
    riders: () => riders,
    rttMs: () => rttMs,
    startsInMs: () => lobbyEndsAt - performance.now(),
    stepsDue: () => {
      if (!race) {
        return 0;
      }
      const { predicted } = race.client;
      const steps = clock.stepsDue(predicted.tick, performance.now());
      if (predicted.tick > 0) {
        tally.stepped(steps);
      }
      return steps;
    },
    target: () => clock.target(performance.now()),
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
