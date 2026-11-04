import { TICK_SECONDS } from "./state.ts";

const TICK_MS = TICK_SECONDS * 1000;
const FIRST_LEAD_TICKS = 8;
const LEAD_MARGIN_TICKS = 2;
const CATCH_UP_AT_TICKS = 2;
const SKIP_AT_TICKS = 3;
const MOST_STEPS = 4;
const NOT_MEASURED = -1;
const RTT_SAMPLES = 10;
const OFFSET_SAG_PER_MS = 0.002;
const FRAMES_PER_EASED_STEP = 6;

export interface RoomClock {
  readonly start: (startAtRoomMs: number) => void;
  readonly heardRoomTime: (roomMs: number, now: number) => void;
  readonly heardTick: (tick: number, now: number) => void;
  readonly heardRtt: (rttMs: number) => void;
  readonly silentMs: (now: number) => number;
  readonly target: (now: number) => number;
  readonly stepsDue: (predictedTick: number, now: number) => number;
}

export const createRoomClock = (): RoomClock => {
  let startsAt = 0;
  let lastArrival = 0;
  let offset = 0;
  let roomAhead = Number.NEGATIVE_INFINITY;
  const rtts: number[] = [];
  let rttAt = 0;
  let framesSinceEased = FRAMES_PER_EASED_STEP;
  const serverTick = (now: number): number =>
    lastArrival === 0
      ? Math.floor((now - startsAt) / TICK_MS)
      : Math.floor((now + offset) / TICK_MS);
  const worstRtt = (): number => {
    let worst = NOT_MEASURED;
    for (const rtt of rtts) {
      worst = Math.max(worst, rtt);
    }
    return worst;
  };
  const tooLateBelow = (now: number): number => {
    let least = Number.POSITIVE_INFINITY;
    for (const rtt of rtts) {
      least = Math.min(least, rtt);
    }
    return (
      serverTick(now) +
      (rtts.length === 0
        ? LEAD_MARGIN_TICKS
        : Math.max(LEAD_MARGIN_TICKS, Math.ceil(least / TICK_MS)))
    );
  };
  const target = (now: number): number => {
    const rtt = worstRtt();
    return (
      serverTick(now) +
      (rtt === NOT_MEASURED
        ? FIRST_LEAD_TICKS
        : Math.ceil(rtt / TICK_MS) + LEAD_MARGIN_TICKS)
    );
  };
  return {
    heardRoomTime: (roomMs, now) => {
      roomAhead = Math.max(roomAhead, roomMs - now);
    },
    heardRtt: (rttMs) => {
      rtts[rttAt] = rttMs;
      rttAt = (rttAt + 1) % RTT_SAMPLES;
    },
    heardTick: (tick, now) => {
      const sample = tick * TICK_MS - now;
      offset =
        lastArrival === 0
          ? sample
          : Math.max(sample, offset - (now - lastArrival) * OFFSET_SAG_PER_MS);
      lastArrival = now;
    },
    silentMs: (now) => now - (lastArrival === 0 ? startsAt : lastArrival),
    start: (startAtRoomMs) => {
      startsAt = startAtRoomMs - roomAhead;
    },
    stepsDue: (predictedTick, now) => {
      const wanted = target(now);
      const gap = wanted - predictedTick;
      framesSinceEased += 1;
      if (wanted <= 0) {
        return 0;
      }
      if (predictedTick < tooLateBelow(now)) {
        return Math.min(Math.max(gap, 1), MOST_STEPS);
      }
      const offTarget = gap <= -SKIP_AT_TICKS || gap >= CATCH_UP_AT_TICKS;
      if (!offTarget || framesSinceEased < FRAMES_PER_EASED_STEP) {
        return 1;
      }
      framesSinceEased = 0;
      return gap < 0 ? 0 : 2;
    },
    target,
  };
};
