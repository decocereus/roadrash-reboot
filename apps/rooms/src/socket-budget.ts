import { WALKS_PER_SECOND } from "@racer/sim/lobby-walk";
import {
  inputBytes,
  MOST_BATCHED_CONTROLS,
  PING_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  READY_PACKET_BYTES,
} from "@racer/sim/room-wire";
import { TICK_SECONDS } from "@racer/sim/state";

import {
  PING_EVERY_MS,
  PINGS_PER_REPORT,
  SILENT_SEAT_MS,
} from "./heartbeat.ts";
import { MOST_COMMAND_CHARS } from "./messages.ts";
import { MOST_TRACE_CHARS } from "./tape.ts";

interface Allowance {
  readonly burst: number;
  readonly perSecond: number;
}

const MS_PER_SECOND = 1000;
const HEADROOM = 2;
const STALL_SECONDS = SILENT_SEAT_MS / MS_PER_SECOND;
const KEY_PRESSES_PER_SECOND = 10;
const REPORT_EVERY_SECONDS = (PINGS_PER_REPORT * PING_EVERY_MS) / MS_PER_SECOND;
const TRACES_TOGETHER = 3;

const steady = (perSecond: number): Allowance => ({
  burst: perSecond * STALL_SECONDS * HEADROOM,
  perSecond: perSecond * HEADROOM,
});

export const socketAllowances = {
  command: steady(WALKS_PER_SECOND + KEY_PRESSES_PER_SECOND),
  packet: steady(1 / TICK_SECONDS + MS_PER_SECOND / PING_EVERY_MS),
  trace: {
    burst: TRACES_TOGETHER * HEADROOM,
    perSecond: HEADROOM / REPORT_EVERY_SECONDS,
  },
} as const satisfies Record<string, Allowance>;

type SocketMessage = keyof typeof socketAllowances;

export const CUT_AFTER_DROPS = 64;

export const MOST_PACKET_BYTES = Math.max(
  inputBytes(MOST_BATCHED_CONTROLS),
  PING_PACKET_BYTES,
  RACE_STATS_PACKET_BYTES,
  READY_PACKET_BYTES
);

const messageOf = (data: string | ArrayBuffer): SocketMessage | null => {
  if (data instanceof ArrayBuffer) {
    return data.byteLength <= MOST_PACKET_BYTES ? "packet" : null;
  }
  if (data.length <= MOST_COMMAND_CHARS) {
    return "command";
  }
  return data.length <= MOST_TRACE_CHARS ? "trace" : null;
};

interface Bucket {
  at: number;
  tokens: number;
}

export interface SocketBudget {
  readonly buckets: Readonly<Record<SocketMessage, Bucket>>;
  dropped: number;
}

const fullBucket = (message: SocketMessage, now: number): Bucket => ({
  at: now,
  tokens: socketAllowances[message].burst,
});

export const createSocketBudget = (now: number): SocketBudget => ({
  buckets: {
    command: fullBucket("command", now),
    packet: fullBucket("packet", now),
    trace: fullBucket("trace", now),
  },
  dropped: 0,
});

export const spend = (
  budget: SocketBudget,
  data: string | ArrayBuffer,
  now: number
): boolean => {
  const message = messageOf(data);
  if (message !== null) {
    const { burst, perSecond } = socketAllowances[message];
    const bucket = budget.buckets[message];
    bucket.tokens = Math.min(
      burst,
      bucket.tokens + ((now - bucket.at) / MS_PER_SECOND) * perSecond
    );
    bucket.at = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
  }
  budget.dropped += 1;
  return false;
};
