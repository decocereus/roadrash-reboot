import {
  PING_PACKET_BYTES,
  PONG_PACKET_BYTES,
  readPing,
  readPong,
  writePing,
  writePong,
} from "@racer/sim/room-wire";
import type { Pong } from "@racer/sim/room-wire";

export const PING_EVERY_MS = 500;
export const DEAD_AFTER_MS = 5000;
const MOST_UNANSWERED_PINGS = DEAD_AFTER_MS / PING_EVERY_MS;
export const SILENT_SEAT_MS = 10_000;
export const SEAT_WATCH_MS = 1000;

const NO_STAMP = 0;

interface PingSocket {
  readonly send: (data: ArrayBufferView) => void;
}

interface PingRules {
  readonly onSilent: () => void;
  readonly onPinged?: () => void;
  readonly silent?: (pongsStopped: boolean) => boolean;
}

interface Pings {
  readonly start: (rules: PingRules) => void;
  readonly stop: () => void;
  readonly hear: (view: DataView) => Readonly<Pong> | null;
}

const whenPongsStop = (pongsStopped: boolean): boolean => pongsStopped;

export const createPings = (socket: PingSocket): Pings => {
  const ping = new DataView(new ArrayBuffer(PING_PACKET_BYTES));
  const pong: Pong = { roomMs: 0, stamp: 0 };
  let unanswered = 0;
  let beats: ReturnType<typeof setInterval> | null = null;

  return {
    hear: (view) => {
      if (!readPong(view, pong)) {
        return null;
      }
      unanswered = 0;
      return pong;
    },
    start: ({ onPinged, onSilent, silent = whenPongsStop }) => {
      beats = setInterval(() => {
        if (silent(unanswered > MOST_UNANSWERED_PINGS)) {
          onSilent();
          return;
        }
        writePing(ping, Math.floor(performance.now()));
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

export const createPongs = (
  roomMs: () => number
): ((ping: DataView) => Uint8Array | null) => {
  const buffer = new ArrayBuffer(PONG_PACKET_BYTES);
  const view = new DataView(buffer);
  return (ping) => {
    const stamp = readPing(ping);
    return stamp < NO_STAMP
      ? null
      : new Uint8Array(buffer, 0, writePong(view, stamp, roomMs()));
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
