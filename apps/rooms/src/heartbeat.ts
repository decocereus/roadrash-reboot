import { LINK_DEAD_AFTER_TICKS } from "@racer/sim/room";
import {
  PING_PACKET_BYTES,
  PONG_PACKET_BYTES,
  readPing,
  readPong,
  writePing,
  writePong,
} from "@racer/sim/room-wire";
import type { Ping, Pong } from "@racer/sim/room-wire";
import { TICK_SECONDS } from "@racer/sim/state";

export const PING_EVERY_MS = 500;
export const DEAD_AFTER_MS = Math.round(
  LINK_DEAD_AFTER_TICKS * TICK_SECONDS * 1000
);
const MOST_UNANSWERED_PINGS = DEAD_AFTER_MS / PING_EVERY_MS;
export const SILENT_SEAT_MS = 10_000;
export const SEAT_WATCH_MS = 1000;

interface PingSocket {
  readonly send: (data: ArrayBufferView) => void;
}

interface PingRules {
  readonly onSilent: () => void;
  readonly onPinged?: () => void;
  readonly silent?: (pongsStopped: boolean) => boolean;
}

interface HeardPong {
  readonly at: number;
  readonly roomMs: number;
  readonly rttMs: number;
}

interface Pings {
  readonly start: (rules: PingRules) => void;
  readonly stop: () => void;
  readonly hear: (view: DataView) => HeardPong | null;
}

const whenPongsStop = (pongsStopped: boolean): boolean => pongsStopped;

export const createPings = (socket: PingSocket): Pings => {
  const ping = new DataView(new ArrayBuffer(PING_PACKET_BYTES));
  const pong: Pong = { roomMs: 0, stamp: 0 };
  const heard = { at: 0, roomMs: 0, rttMs: 0 };
  let lastRttMs: number | null = null;
  let unanswered = 0;
  let beats: ReturnType<typeof setInterval> | null = null;

  return {
    hear: (view) => {
      if (!readPong(view, pong)) {
        return null;
      }
      unanswered = 0;
      heard.at = performance.now();
      heard.roomMs = pong.roomMs;
      heard.rttMs = Math.floor(heard.at) - pong.stamp;
      lastRttMs = heard.rttMs;
      return heard;
    },
    start: ({ onPinged, onSilent, silent = whenPongsStop }) => {
      beats = setInterval(() => {
        if (silent(unanswered > MOST_UNANSWERED_PINGS)) {
          onSilent();
          return;
        }
        writePing(ping, Math.floor(performance.now()), lastRttMs);
        socket.send(new Uint8Array(ping.buffer, 0, PING_PACKET_BYTES));
        unanswered += 1;
        onPinged?.();
      }, PING_EVERY_MS);
    },
    stop: () => {
      if (beats) {
        clearInterval(beats);
        beats = null;
      }
    },
  };
};

interface PingAnswer {
  readonly pong: Uint8Array;
  rttMs: number | null;
}

export const createPongs = (
  roomMs: () => number
): ((ping: DataView) => Readonly<PingAnswer> | null) => {
  const buffer = new ArrayBuffer(PONG_PACKET_BYTES);
  const view = new DataView(buffer);
  const heard: Ping = { rttMs: null, stamp: 0 };
  const answer: PingAnswer = { pong: new Uint8Array(buffer), rttMs: null };
  return (ping) => {
    if (!readPing(ping, heard)) {
      return null;
    }
    writePong(view, heard.stamp, roomMs());
    answer.rttMs = heard.rttMs;
    return answer;
  };
};

interface Heard {
  readonly heardAt: number;
}

interface SilenceClock {
  readonly now: () => number;
  readonly after: (ms: number, wake: () => void) => void;
}

interface SilenceRules<T extends Heard> {
  readonly heard: () => Iterable<T>;
  readonly onSilent: (silent: T) => void;
  readonly onSwept: (now: number, silent: number) => boolean;
}

export const watchForSilence = <T extends Heard>(
  clock: SilenceClock,
  { heard, onSilent, onSwept }: SilenceRules<T>
): (() => void) => {
  let watching = false;
  const sweep = (): void => {
    const now = clock.now();
    let silent = 0;
    for (const listener of heard()) {
      if (now - listener.heardAt > SILENT_SEAT_MS) {
        silent += 1;
        onSilent(listener);
      }
    }
    watching = onSwept(now, silent);
    if (watching) {
      clock.after(SEAT_WATCH_MS, sweep);
    }
  };
  return () => {
    if (!watching) {
      watching = true;
      clock.after(SEAT_WATCH_MS, sweep);
    }
  };
};
