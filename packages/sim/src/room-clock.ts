import { PACE_SLEW_PER_SECOND } from "./room-pace.ts";
import { INPUT_HORIZON, MOST_LEAD_TICKS, SLOWING_TICKS } from "./room.ts";
import { TICK_SECONDS } from "./state.ts";

const TICK_MS = TICK_SECONDS * 1000;
const FIRST_LEAD_TICKS = 8;
const LEAD_MARGIN_TICKS = 2;
const NOT_MEASURED = -1;
const RTT_SAMPLES = 10;
const RAISE_FADE_MS = 20_000;
const LOST_CONTROL_RAISE_MS = 2 * TICK_MS;
const ARRIVAL_WINDOW = 120;
const ARRIVAL_WINDOW_MS = 1000;
const EARLY_SHARE = 0.1;
const JITTER_SECONDS = 5;
const BLOATED_FROM_TICKS = 12;
const PACE_PER_TICK = 0.02;
const MOST_PACE_CHANGE = 0.1;
const MOST_TRIM = 0.02;
const MOST_INPUT_DELAY_TICKS = 30;
const MOST_AHEAD_TICKS = 20;
const LEAST_AHEAD_OF_ROOM_TICKS = 6;
const HELD_FROM_MS = 250;
const HOLDS_RECUR_WITHIN_MS = JITTER_SECONDS * 1000;

const clampTo = (value: number, most: number): number =>
  Math.min(most, Math.max(-most, value));

const steerFor = (
  predictedTick: number,
  wanted: number,
  floor: number,
  ceiling: number
): number => {
  if (predictedTick < floor) {
    return clampTo(
      (floor - predictedTick) * PACE_PER_TICK + MOST_TRIM,
      MOST_PACE_CHANGE
    );
  }
  if (predictedTick > ceiling) {
    return clampTo(
      (ceiling - predictedTick) * PACE_PER_TICK - MOST_TRIM,
      MOST_PACE_CHANGE
    );
  }
  return clampTo((wanted - predictedTick) * PACE_PER_TICK, MOST_TRIM);
};

export interface RoomClock {
  readonly start: (startAtRoomMs: number) => void;
  readonly heardRoomTime: (roomMs: number, now: number) => void;
  readonly heardTick: (tick: number, now: number) => void;
  readonly heardRtt: (rttMs: number, now: number) => void;
  readonly inputDelay: (predictedTick: number, now: number) => number;
  readonly leadBloated: (predictedTick: number, now: number) => boolean;
  readonly lostControl: (
    tick: number,
    sentThrough: number,
    now: number
  ) => void;
  readonly pace: (
    predictedTick: number,
    confirmedTick: number,
    now: number
  ) => number;
  readonly silentMs: (now: number) => number;
  readonly target: (now: number) => number;
  readonly stepsDue: (
    predictedTick: number,
    confirmedTick: number,
    now: number
  ) => number;
}

export const createRoomClock = (): RoomClock => {
  let startsAt = 0;
  let lastArrival = 0;
  let offset = 0;
  let placed = false;
  let paced = 1;
  let pacedAt = Number.NEGATIVE_INFINITY;
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
  let heldEndedAt = Number.NEGATIVE_INFINITY;
  let gapEndedAt = Number.NEGATIVE_INFINITY;
  let lastPongAt = Number.NEGATIVE_INFINITY;
  let lastPongSentAt = Number.NEGATIVE_INFINITY;
  const arrivals = new Float64Array(ARRIVAL_WINDOW);
  const arrivedAt = new Float64Array(ARRIVAL_WINDOW).fill(
    Number.NEGATIVE_INFINITY
  );
  const ordered = new Float64Array(ARRIVAL_WINDOW);
  const settled = new Float64Array(ARRIVAL_WINDOW);
  let arrivalAt = 0;
  const jitterOfSecond = new Float64Array(JITTER_SECONDS);
  const recentJitter = new Float64Array(JITTER_SECONDS);
  let jitterSecond = Number.NEGATIVE_INFINITY;
  let jitterSlot = JITTER_SECONDS - 1;
  let jitterSeconds = 0;
  const heardJitter = (windowMs: number, now: number): void => {
    const second = Math.floor(now / ARRIVAL_WINDOW_MS);
    if (second === jitterSecond) {
      jitterOfSecond[jitterSlot] = Math.max(
        jitterOfSecond[jitterSlot] ?? 0,
        windowMs
      );
    } else {
      jitterSecond = second;
      jitterSlot = (jitterSlot + 1) % JITTER_SECONDS;
      jitterOfSecond[jitterSlot] = windowMs;
      jitterSeconds = Math.min(JITTER_SECONDS, jitterSeconds + 1);
    }
    recentJitter.set(jitterOfSecond);
    recentJitter.fill(Number.NaN, jitterSeconds);
    recentJitter.sort();
    jitterMs = recentJitter[Math.floor((jitterSeconds - 1) / 2)] ?? windowMs;
  };
  const heardArrival = (sample: number, now: number): void => {
    arrivals[arrivalAt] = sample;
    arrivedAt[arrivalAt] = now;
    arrivalAt = (arrivalAt + 1) % ARRIVAL_WINDOW;
    ordered.fill(Number.NaN);
    settled.fill(Number.NaN);
    let count = 0;
    let steady = 0;
    for (let at = 0; at < ARRIVAL_WINDOW; at += 1) {
      const heardAt = arrivedAt[at] ?? 0;
      if (heardAt > now - ARRIVAL_WINDOW_MS) {
        const heardSample = arrivals[at] ?? sample;
        ordered[count] = heardSample;
        count += 1;
        if (heardAt - heldEndedAt >= ARRIVAL_WINDOW_MS) {
          settled[steady] = heardSample;
          steady += 1;
        }
      }
    }
    ordered.sort();
    settled.sort();
    if (steady === 0 && placed) {
      return;
    }
    placed = true;
    const earliest = ordered[count - 1] ?? sample;
    const late = settled[Math.floor(EARLY_SHARE * (steady - 1))] ?? sample;
    offset = earliest;
    heardJitter(Math.floor(earliest - late), now);
  };
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
  const leadFor = (excessMs: number): number =>
    typicalRtt === NOT_MEASURED
      ? FIRST_LEAD_TICKS
      : Math.ceil((typicalRtt + excessMs + jitterMs) / TICK_MS) +
        LEAD_MARGIN_TICKS;
  const target = (now: number): number =>
    serverTick(now) +
    Math.min(MOST_LEAD_TICKS - LEAD_MARGIN_TICKS, leadFor(raisedAbove(now)));
  return {
    heardRoomTime: (roomMs, now) => {
      roomAhead = Math.max(roomAhead, roomMs - now);
    },
    heardRtt: (rttMs, now) => {
      const sentAt = now - rttMs;
      const bunched =
        now - lastPongAt < HELD_FROM_MS &&
        Math.abs(sentAt - lastPongSentAt) >= HELD_FROM_MS;
      lastPongAt = now;
      lastPongSentAt = sentAt;
      if (bunched) {
        rtts[(rttAt + RTT_SAMPLES - 1) % RTT_SAMPLES] = Number.NaN;
      } else {
        rtts[rttAt] = rttMs;
        rttAt = (rttAt + 1) % RTT_SAMPLES;
      }
      sorted.length = 0;
      for (const rtt of rtts) {
        if (!Number.isNaN(rtt)) {
          sorted.push(rtt);
        }
      }
      sorted.sort((left, right) => left - right);
      typicalRtt = sorted[Math.floor(sorted.length / 2)] ?? typicalRtt;
      lastRtt = bunched ? lastRtt : rttMs;
    },
    heardTick: (tick, now) => {
      if (now - (lastArrival === 0 ? startsAt : lastArrival) >= HELD_FROM_MS) {
        if (now - gapEndedAt >= HOLDS_RECUR_WITHIN_MS) {
          heldEndedAt = now;
        }
        gapEndedAt = now;
      }
      heardArrival(tick * TICK_MS - now, now);
      lastArrival = now;
    },
    inputDelay: (predictedTick, now) =>
      Math.min(
        MOST_INPUT_DELAY_TICKS,
        Math.max(0, target(now) - predictedTick)
      ),
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
    pace: (predictedTick, confirmedTick, now) => {
      const wanted = target(now);
      if (wanted <= 0) {
        paced = 1;
        pacedAt = now;
        return 1;
      }
      const floor = Math.max(
        wanted - MOST_INPUT_DELAY_TICKS,
        Math.min(wanted, serverTick(now) + LEAST_AHEAD_OF_ROOM_TICKS)
      );
      const ceiling = Math.min(
        wanted + MOST_AHEAD_TICKS,
        serverTick(now) + MOST_LEAD_TICKS - LEAD_MARGIN_TICKS
      );
      const steer = 1 + steerFor(predictedTick, wanted, floor, ceiling);
      const most = (PACE_SLEW_PER_SECOND * (now - pacedAt)) / 1000;
      paced += Math.min(most, Math.max(-most, steer - paced));
      pacedAt = now;
      const room = INPUT_HORIZON - (predictedTick - confirmedTick);
      const slowing = Math.max(0, room) / SLOWING_TICKS;
      return slowing < 1 ? Math.min(paced, slowing) : paced;
    },
    silentMs: (now) => now - (lastArrival === 0 ? startsAt : lastArrival),
    start: (startAtRoomMs) => {
      startsAt = startAtRoomMs - roomAhead;
      offset = -startsAt;
      placed = true;
    },
    stepsDue: (predictedTick, confirmedTick, now) =>
      target(now) <= 0 || predictedTick - confirmedTick >= INPUT_HORIZON
        ? 0
        : 1,
    target,
  };
};
