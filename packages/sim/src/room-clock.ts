import { TICK_SECONDS } from "./state.ts";

const TICK_MS = TICK_SECONDS * 1000;
const FIRST_LEAD_TICKS = 8;
const LEAD_MARGIN_TICKS = 2;
const CATCH_UP_AT_TICKS = 2;
const SKIP_AT_TICKS = 2;
const MOST_STEPS = 4;
const NOT_MEASURED = -1;
const RTT_SAMPLES = 10;
const OFFSET_SAG_PER_MS = 0.002;
const FRAMES_PER_EASED_STEP = 6;
const FRAMES_PER_EASED_SKIP = 3;
const RAISE_FADE_MS = 2000;
const LOST_CONTROL_RAISE_MS = 2 * TICK_MS;
const ARRIVAL_WINDOW = 120;
const ARRIVAL_WINDOW_MS = 2000;
const EARLY_SHARE = 0.1;
const BLOATED_FROM_TICKS = 12;

export interface RoomClock {
  readonly start: (startAtRoomMs: number) => void;
  readonly heardRoomTime: (roomMs: number, now: number) => void;
  readonly heardTick: (tick: number, now: number) => void;
  readonly heardRtt: (rttMs: number, now: number) => void;
  readonly leadBloated: (predictedTick: number, now: number) => boolean;
  readonly lostControl: (
    tick: number,
    sentThrough: number,
    now: number
  ) => void;
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
  const sorted: number[] = [];
  let rttAt = 0;
  let typicalRtt = NOT_MEASURED;
  let lastRtt = NOT_MEASURED;
  let raisedRtt = 0;
  let raisedAt = 0;
  let raisedThrough = 0;
  let jitterMs = 0;
  const arrivals = new Float64Array(ARRIVAL_WINDOW);
  const arrivedAt = new Float64Array(ARRIVAL_WINDOW).fill(
    Number.NEGATIVE_INFINITY
  );
  const ordered = new Float64Array(ARRIVAL_WINDOW);
  let arrivalAt = 0;
  const lateSpread = (sample: number, now: number): number => {
    arrivals[arrivalAt] = sample;
    arrivedAt[arrivalAt] = now;
    arrivalAt = (arrivalAt + 1) % ARRIVAL_WINDOW;
    ordered.fill(Number.NaN);
    let count = 0;
    for (let at = 0; at < ARRIVAL_WINDOW; at += 1) {
      if ((arrivedAt[at] ?? 0) > now - ARRIVAL_WINDOW_MS) {
        ordered[count] = arrivals[at] ?? sample;
        count += 1;
      }
    }
    ordered.sort();
    const earliest = ordered[count - 1] ?? sample;
    const late = ordered[Math.floor(EARLY_SHARE * (count - 1))] ?? sample;
    return Math.floor(earliest - late);
  };
  let framesSinceEased = FRAMES_PER_EASED_STEP;
  const serverTick = (now: number): number =>
    lastArrival === 0
      ? Math.floor((now - startsAt) / TICK_MS)
      : Math.floor((now + offset) / TICK_MS);
  const raisedAbove = (now: number): number =>
    Math.max(0, raisedRtt - typicalRtt) *
    Math.max(0, 1 - (now - raisedAt) / RAISE_FADE_MS);
  const raiseTo = (rttMs: number, now: number): void => {
    if (rttMs - typicalRtt > raisedAbove(now)) {
      raisedRtt = rttMs;
      raisedAt = now;
    }
  };
  const tooLateBelow = (now: number): number =>
    serverTick(now) +
    (typicalRtt === NOT_MEASURED
      ? LEAD_MARGIN_TICKS
      : Math.max(
          LEAD_MARGIN_TICKS,
          Math.ceil((typicalRtt + raisedAbove(now)) / TICK_MS)
        ));
  const leadFor = (excessMs: number): number =>
    typicalRtt === NOT_MEASURED
      ? FIRST_LEAD_TICKS
      : Math.ceil((typicalRtt + excessMs + jitterMs) / TICK_MS) +
        LEAD_MARGIN_TICKS;
  const target = (now: number): number =>
    serverTick(now) + leadFor(raisedAbove(now));
  return {
    heardRoomTime: (roomMs, now) => {
      roomAhead = Math.max(roomAhead, roomMs - now);
    },
    heardRtt: (rttMs, now) => {
      rtts[rttAt] = rttMs;
      rttAt = (rttAt + 1) % RTT_SAMPLES;
      sorted.length = 0;
      sorted.push(...rtts);
      sorted.sort((left, right) => left - right);
      typicalRtt = sorted[Math.floor(sorted.length / 2)] ?? rttMs;
      lastRtt = rttMs;
      raiseTo(rttMs, now);
    },
    heardTick: (tick, now) => {
      const sample = tick * TICK_MS - now;
      offset =
        lastArrival === 0
          ? sample
          : Math.max(sample, offset - (now - lastArrival) * OFFSET_SAG_PER_MS);
      lastArrival = now;
      jitterMs = lateSpread(sample, now);
    },
    leadBloated: (predictedTick, now) =>
      predictedTick -
        serverTick(now) -
        leadFor(Math.max(0, lastRtt - typicalRtt)) >=
      BLOATED_FROM_TICKS,
    lostControl: (tick, sentThrough, now) => {
      if (tick <= raisedThrough || tick > sentThrough) {
        return;
      }
      raisedThrough = sentThrough;
      raiseTo(typicalRtt + raisedAbove(now) + LOST_CONTROL_RAISE_MS, now);
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
      const ahead = gap <= -SKIP_AT_TICKS;
      const easeEvery = ahead ? FRAMES_PER_EASED_SKIP : FRAMES_PER_EASED_STEP;
      if ((!ahead && gap < CATCH_UP_AT_TICKS) || framesSinceEased < easeEvery) {
        return 1;
      }
      framesSinceEased = 0;
      return gap < 0 ? 0 : 2;
    },
    target,
  };
};
