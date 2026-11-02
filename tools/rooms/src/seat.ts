import { seatedRace } from "@racer/career/room-race";
import { decodeRoomMessage, SEAT_CLOSED } from "@racer/rooms/messages";
import { controlOf } from "@racer/sim/control";
import { createRoomClient } from "@racer/sim/room-client";
import type { RoomClient } from "@racer/sim/room-client";
import { createTickFrame } from "@racer/sim/room-frame";
import {
  createReadTick,
  inputBytes,
  MOST_BATCHED_CONTROLS,
  PING_PACKET_BYTES,
  readPong,
  readTick,
  START_PACKET_BYTES,
  writePing,
  writeStart,
} from "@racer/sim/room-wire";
import { setupDigest } from "@racer/sim/snapshot-setup";
import { riderIdAt, TICK_SECONDS } from "@racer/sim/state";
import * as Option from "effect/Option";

const TICK_MS = TICK_SECONDS * 1000;
const PING_EVERY_MS = 500;
const LEAD_MARGIN_TICKS = 2;
const FIRST_LEAD_TICKS = 8;
const STEER_PERIOD_TICKS = 37;

export interface SeatReport {
  readonly you: number;
  readonly digestMatched: boolean;
  readonly ticks: number;
  readonly hashesCompared: number;
  readonly desyncs: number;
  readonly rollbacks: number;
  readonly resimulatedTicks: number;
  readonly refusedPredictions: number;
  readonly rttMs: number;
  readonly arrivalGapP50Ms: number;
  readonly arrivalGapP99Ms: number;
  readonly arrivalGapMaxMs: number;
  readonly closeCode: number | null;
  readonly ended: boolean;
  readonly refused: string | null;
}

export interface Seat {
  readonly socket: WebSocket;
  readonly opened: () => boolean;
  readonly seatsSeen: () => number;
  readonly started: () => boolean;
  readonly start: () => void;
  readonly leave: () => void;
  readonly over: () => boolean;
  readonly report: () => SeatReport;
}

const quantile = (sorted: readonly number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

const steerOf = (tick: number, rider: number): number => {
  const phase = (tick + rider * 11) % (STEER_PERIOD_TICKS * 2);
  return phase < STEER_PERIOD_TICKS ? 0.35 : -0.35;
};

export const openSeat = (url: string): Seat => {
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  const read = createReadTick(createTickFrame());
  const pong = { stamp: 0, tick: 0 };
  const input = new DataView(
    new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS))
  );
  const ping = new DataView(new ArrayBuffer(PING_PACKET_BYTES));
  const gaps: number[] = [];
  let open = false;
  let seatsSeen = 0;
  let client: RoomClient | null = null;
  let you = -1;
  let digestMatched = false;
  let lastArrival = 0;
  let lastServerTick = 0;
  let rttMs = 0;
  let hashesCompared = 0;
  let refusedPredictions = 0;
  let closeCode: number | null = null;
  let ended = false;
  let refused: string | null = null;
  let startsAt = 0;
  let pump: ReturnType<typeof setInterval> | null = null;
  let pings: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (pump) {
      clearInterval(pump);
    }
    if (pings) {
      clearInterval(pings);
    }
  };

  const predict = (): void => {
    if (!client || closeCode !== null) {
      return;
    }
    const now = performance.now();
    if (now < startsAt - TICK_MS * FIRST_LEAD_TICKS) {
      return;
    }
    const leadTicks =
      rttMs === 0
        ? FIRST_LEAD_TICKS
        : Math.ceil(rttMs / 2 / TICK_MS) + LEAD_MARGIN_TICKS;
    const serverTick =
      lastArrival === 0
        ? Math.max(0, Math.floor((now - startsAt) / TICK_MS))
        : lastServerTick + Math.floor((now - lastArrival) / TICK_MS);
    const target = serverTick + leadTicks;
    while (client.predicted.tick < target) {
      const tick = client.predicted.tick + 1;
      const accepted = client.predict(
        controlOf({
          brake: 0,
          kick: false,
          punch: tick % 241 === 0,
          steer: steerOf(tick, you),
          throttle: 1,
        })
      );
      if (!accepted) {
        refusedPredictions += 1;
        break;
      }
    }
    for (
      let bytes = client.writeInputs(input);
      bytes > 0;
      bytes = client.writeInputs(input)
    ) {
      socket.send(new Uint8Array(input.buffer, 0, bytes));
    }
  };

  const onStarted = (
    seed: number,
    seats: number,
    rider: number,
    digest: readonly number[],
    startsInMs: number
  ): void => {
    const { setup } = seatedRace(seed, seats);
    you = rider;
    client = createRoomClient(setup, riderIdAt(rider));
    const mine = setupDigest(client.confirmed, setup.track);
    digestMatched = digest.join(",") === [...mine].join(",");
    startsAt = performance.now() + startsInMs;
    pump = setInterval(predict, TICK_MS);
    pings = setInterval(() => {
      writePing(ping, Math.floor(performance.now()));
      socket.send(new Uint8Array(ping.buffer, 0, PING_PACKET_BYTES));
    }, PING_EVERY_MS);
  };

  const onBinary = (data: ArrayBuffer): void => {
    const view = new DataView(data);
    if (readPong(view, pong)) {
      rttMs = Math.floor(performance.now()) - pong.stamp;
      return;
    }
    if (client && readTick(view, read)) {
      const now = performance.now();
      if (lastArrival !== 0) {
        gaps.push(now - lastArrival);
      }
      lastArrival = now;
      lastServerTick = read.frame.tick;
      hashesCompared += read.hashed ? 1 : 0;
      client.confirm(read.frame, read.hashed ? read.hash : null);
    }
  };

  socket.addEventListener("open", () => {
    open = true;
  });
  socket.addEventListener("close", (event) => {
    closeCode = event.code;
    stop();
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
        seatsSeen = message.value.seats;
        break;
      }
      case "started": {
        const { digest, seats, seed, startsInMs, you: rider } = message.value;
        onStarted(seed, seats, rider, digest, startsInMs);
        break;
      }
      case "ended": {
        ended = true;
        socket.close(SEAT_CLOSED, "The race is over.");
        break;
      }
      case "refused": {
        refused = message.value.reason;
        socket.close(SEAT_CLOSED, "This seat was refused.");
        break;
      }
      default: {
        message.value satisfies never;
      }
    }
  });

  return {
    leave: () => {
      socket.close(SEAT_CLOSED, "The verifier left this seat.");
    },
    opened: () => open,
    over: () => ended || refused !== null || closeCode !== null,
    report: () => {
      const sorted = gaps.toSorted((left, right) => left - right);
      return {
        arrivalGapMaxMs: sorted.at(-1) ?? 0,
        arrivalGapP50Ms: quantile(sorted, 0.5),
        arrivalGapP99Ms: quantile(sorted, 0.99),
        closeCode,
        desyncs: client?.stats.desyncs ?? 0,
        digestMatched,
        ended,
        hashesCompared,
        refused,
        refusedPredictions,
        resimulatedTicks: client?.stats.resimulatedTicks ?? 0,
        rollbacks: client?.stats.rollbacks ?? 0,
        rttMs,
        ticks: client?.confirmed.tick ?? 0,
        you,
      };
    },
    seatsSeen: () => seatsSeen,
    socket,
    start: () => {
      const packet = new DataView(new ArrayBuffer(START_PACKET_BYTES));
      writeStart(packet);
      socket.send(packet.buffer);
    },
    started: () => client !== null,
  };
};
