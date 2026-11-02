import { TICK_SECONDS } from "./state.ts";

const TICK_MS = TICK_SECONDS * 1000;
const FIRST_LEAD_TICKS = 8;
const LEAD_MARGIN_TICKS = 2;
const CATCH_UP_AT_TICKS = 2;
const SKIP_AT_TICKS = 3;
const MOST_STEPS = 4;
const NOT_MEASURED = -1;

export interface RoomClock {
  readonly start: (startsInMs: number, now: number) => void;
  readonly heardTick: (tick: number, now: number) => void;
  readonly heardRtt: (rttMs: number) => void;
  readonly target: (now: number) => number;
  readonly stepsDue: (predictedTick: number, now: number) => number;
}

export const createRoomClock = (): RoomClock => {
  let startsAt = 0;
  let lastArrival = 0;
  let lastTick = 0;
  let rtt = NOT_MEASURED;
  const serverTick = (now: number): number =>
    lastArrival === 0
      ? Math.floor((now - startsAt) / TICK_MS)
      : lastTick + Math.floor((now - lastArrival) / TICK_MS);
  const target = (now: number): number =>
    serverTick(now) +
    (rtt === NOT_MEASURED
      ? FIRST_LEAD_TICKS
      : Math.ceil(rtt / 2 / TICK_MS) + LEAD_MARGIN_TICKS);
  return {
    heardRtt: (rttMs) => {
      rtt = rttMs;
    },
    heardTick: (tick, now) => {
      lastTick = tick;
      lastArrival = now;
    },
    start: (startsInMs, now) => {
      startsAt = now + startsInMs;
    },
    stepsDue: (predictedTick, now) => {
      const wanted = target(now);
      const gap = wanted - predictedTick;
      if (wanted <= 0 || gap <= -SKIP_AT_TICKS) {
        return 0;
      }
      return gap >= CATCH_UP_AT_TICKS ? Math.min(gap, MOST_STEPS) : 1;
    },
    target,
  };
};
