import { describe, expect, it } from "vitest";

import { createRoomClock } from "./room-clock.ts";
import { INPUT_HORIZON } from "./room.ts";
import { TICK_SECONDS } from "./state.ts";

const TICK_MS = TICK_SECONDS * 1000;

const roomTick = (atMs: number): number => Math.floor(atMs / TICK_MS);
const FADED_MS = 6000;
const LOST_FADED_MS = 20_000;
const STEADY_RTT_MS = 100;
const STEADY_LEAD = 8;
const PING_EVERY_MS = 500;

interface Spike {
  readonly atMs: number;
  readonly rttMs: number;
}

const riddenLead = (spikes: readonly Spike[]) => {
  const clock = createRoomClock();
  const leads = new Map<number, number>();
  let predicted = 0;
  let progress = 0;
  let nextPing = 0;
  for (let tick = 0; tick * TICK_MS < 20_000; tick += 1) {
    const now = tick * TICK_MS + STEADY_RTT_MS / 2;
    clock.heardTick(tick, now);
    if (now >= nextPing) {
      nextPing += PING_EVERY_MS;
      const spike = spikes.find(
        ({ atMs }) => Math.abs(atMs - now) < PING_EVERY_MS / 2
      );
      clock.heardRtt(spike?.rttMs ?? STEADY_RTT_MS, now);
    }
    progress = Math.max(progress, tick) + clock.pace(predicted, tick, now);
    predicted = Math.floor(progress);
    leads.set(Math.round(now / 100) * 100, predicted - tick);
  }
  return (atMs: number): number => leads.get(atMs) ?? Number.NaN;
};

const ONE_WAY_MS = STEADY_RTT_MS / 2;

const heldTicksAfter = (
  lateMs: (sentAt: number) => number,
  untilMs: number
): number => {
  const clock = createRoomClock();
  let now = 0;
  for (let tick = 0; tick * TICK_MS <= untilMs; tick += 1) {
    now = tick * TICK_MS + ONE_WAY_MS + lateMs(tick * TICK_MS);
    clock.heardTick(tick, now);
  }
  clock.heardRtt(STEADY_RTT_MS, now);
  return clock.target(now) - roomTick(now + ONE_WAY_MS);
};

const STALLED_UNTIL_MS = 10_000;
const STALL_EVERY_MS = 500;
const STALL_MS = 300;
const stalledAtStart = (sentAt: number): number => {
  const into = sentAt % STALL_EVERY_MS;
  return sentAt < STALLED_UNTIL_MS && into < STALL_MS ? STALL_MS - into : 0;
};

const leadOver = (
  lateMs: (sentAt: number) => number,
  untilMs: number,
  pings?: (clock: ReturnType<typeof createRoomClock>, now: number) => void
): number => {
  const clock = createRoomClock();
  for (let sample = 0; sample < 10; sample += 1) {
    clock.heardRtt(STEADY_RTT_MS, 0);
  }
  let now = 0;
  let tick = 0;
  for (; tick * TICK_MS <= untilMs; tick += 1) {
    const arrives = Math.max(
      now,
      tick * TICK_MS + ONE_WAY_MS + lateMs(tick * TICK_MS)
    );
    now = arrives;
    clock.heardTick(tick, now);
    pings?.(clock, now);
  }
  return clock.target(now) - roomTick(now);
};

const neverLate = (): number => 0;

const HOLD_FROM_MS = 10_000;
const HOLD_MS = 2500;
const heldOnce = (sentAt: number): number =>
  sentAt >= HOLD_FROM_MS && sentAt < HOLD_FROM_MS + HOLD_MS
    ? HOLD_FROM_MS + HOLD_MS - sentAt
    : 0;
const lateEverySixth =
  (fromMs: number) =>
  (sentAt: number): number =>
    sentAt >= fromMs && Math.floor(sentAt / TICK_MS) % 6 === 0 ? 60 : 0;

describe("the room clock", () => {
  it("keeps its lead through a 2.5 s hold on the room's ticks and the pings caught in it", () => {
    const pinged: number[] = [];
    const lead = leadOver(heldOnce, 14_000, (clock, now) => {
      if (now < HOLD_FROM_MS + HOLD_MS) {
        return;
      }
      for (
        let sent = HOLD_FROM_MS;
        sent < HOLD_FROM_MS + HOLD_MS;
        sent += PING_EVERY_MS
      ) {
        if (!pinged.includes(sent)) {
          pinged.push(sent);
          clock.heardRtt(now - sent, now);
        }
      }
    });
    expect(lead).toBe(leadOver(neverLate, 14_000));
  });

  it("counts lateness from the first second it hears", () => {
    expect(leadOver(lateEverySixth(0), 1000)).toBeGreaterThanOrEqual(
      leadOver(neverLate, 1000) + 3
    );
  });

  it("takes up lateness that lasts three seconds but not one", () => {
    const late = lateEverySixth(10_000);
    expect(leadOver(late, 10_900)).toBe(leadOver(neverLate, 10_900));
    expect(leadOver(late, 13_000)).toBeGreaterThanOrEqual(
      leadOver(neverLate, 13_000) + 3
    );
  });

  it("counts down to the room's start moment, as fast as this link can hear it", () => {
    const clock = createRoomClock();
    clock.heardRoomTime(10_000, 1050);
    clock.heardRoomTime(10_500, 1520);
    clock.start(13_000);
    expect(clock.silentMs(4020)).toBe(0);
  });

  it("is not fooled by a late packet about the room's time", () => {
    const clock = createRoomClock();
    clock.heardRoomTime(10_000, 1020);
    clock.heardRoomTime(10_500, 1900);
    clock.start(13_000);
    expect(clock.silentMs(4020)).toBe(0);
  });

  it("waits through the countdown until the lead reaches the first tick", () => {
    const clock = createRoomClock();
    clock.heardRoomTime(0, 0);
    clock.start(3000);
    expect(clock.stepsDue(0, 0, 0)).toBe(0);
    expect(clock.stepsDue(0, 0, 3000 - TICK_MS * 8)).toBe(0);
    expect(clock.stepsDue(0, 0, 3000)).toBe(1);
  });

  it("leads the tick it heard by the whole round trip and a margin", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(100, 1000);
    expect(clock.target(1000)).toBe(108);
  });

  it.each([0, 20, 100, 200])(
    "lands a control before its tick over a %i ms round trip",
    (rttMs) => {
      const clock = createRoomClock();
      const now = 5000;
      clock.heardRtt(rttMs, now);
      clock.heardTick(roomTick(now - rttMs / 2), now);
      expect(clock.target(now)).toBeGreaterThan(roomTick(now + rttMs / 2));
    }
  );

  it("counts silence from the start, then from the last tick heard", () => {
    const clock = createRoomClock();
    clock.heardRoomTime(0, 0);
    clock.start(3000);
    expect(clock.silentMs(1000)).toBeLessThan(0);
    expect(clock.silentMs(4000)).toBe(1000);
    clock.heardTick(1, 4000);
    expect(clock.silentMs(4500)).toBe(500);
  });

  it("treats a measured round trip of zero as a measurement", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    expect(clock.target(1000)).toBe(108);
    clock.heardRtt(0, 1000);
    expect(clock.target(1000)).toBe(102);
  });

  it("steps once a tick while the lead wobbles by one", () => {
    const clock = createRoomClock();
    clock.heardRtt(1, 1000);
    clock.heardTick(100, 1000);
    expect(clock.stepsDue(102, 100, 1000)).toBe(1);
    expect(clock.stepsDue(103, 100, 1000)).toBe(1);
    expect(clock.stepsDue(104, 100, 1000)).toBe(1);
  });

  it("does not move its idea of the server back when a tick arrives late", () => {
    const clock = createRoomClock();
    clock.heardRtt(0, 1000);
    clock.heardTick(100, 1000);
    const onTime = clock.target(1000 + TICK_MS);
    clock.heardTick(101, 1000 + TICK_MS + 150);
    expect(clock.target(1000 + TICK_MS + 150)).toBeGreaterThanOrEqual(
      onTime + 8
    );
  });

  it("follows a route that got slower, a little at a time", () => {
    const clock = createRoomClock();
    clock.heardRtt(0, 1000);
    clock.heardTick(0, 0);
    const slower = 100;
    for (let tick = 1; tick <= roomTick(60_000); tick += 1) {
      clock.heardTick(tick, tick * TICK_MS + slower);
    }
    expect(clock.target(60_000 + slower)).toBeLessThanOrEqual(
      roomTick(60_000) + 2 + 2
    );
  });

  it("runs at most a tenth faster, one tick a step, even when its controls would reach the room too late", () => {
    const clock = createRoomClock();
    for (let sample = 0; sample < 10; sample += 1) {
      clock.heardRtt(300, 1000);
    }
    clock.heardTick(309, 5000);
    expect(clock.pace(312, 309, 5000)).toBeCloseTo(1.1);
    expect(clock.stepsDue(312, 309, 5000)).toBe(1);
  });

  it("sizes the lead from the typical round trip, not the worst", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(300, 1000);
    for (let sample = 0; sample < 9; sample += 1) {
      clock.heardRtt(100, 1000);
    }
    expect(clock.target(1000 + FADED_MS)).toBe(
      roomTick(1000 + FADED_MS) - roomTick(1000) + 108
    );
  });

  it("rides through one slow round trip at its steady lead, because chasing a spike would only surge the race", () => {
    const lead = riddenLead([{ atMs: 10_000, rttMs: 1000 }]);
    for (let atMs = 9000; atMs <= 15_000; atMs += 100) {
      expect(lead(atMs)).toBeGreaterThanOrEqual(STEADY_LEAD);
      expect(lead(atMs)).toBeLessThanOrEqual(STEADY_LEAD + 1);
    }
  });

  it("rises once for each run of lost controls, not for ticks it never predicted, and fades over 20 s", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(100, 1000);
    const steady = clock.target(1000);
    clock.lostControl(101, 110, 1000);
    clock.lostControl(105, 110, 1000);
    clock.lostControl(110, 112, 1000);
    expect(clock.target(1000)).toBe(steady + 2);
    clock.lostControl(111, 114, 1000);
    expect(clock.target(1000)).toBe(steady + 4);
    for (let tick = 115; tick < 170; tick += 1) {
      clock.lostControl(tick, 114, 1000);
    }
    expect(clock.target(1000)).toBe(steady + 4);
    const untouched = createRoomClock();
    untouched.heardTick(100, 1000);
    untouched.heardRtt(100, 1000);
    expect(clock.target(1000 + LOST_FADED_MS)).toBe(
      untouched.target(1000 + LOST_FADED_MS)
    );
  });

  it("follows a round trip that stays slower once it is the typical one, and not one slow ping before", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    for (let sample = 0; sample < 10; sample += 1) {
      clock.heardRtt(100, 1000 + sample * PING_EVERY_MS);
    }
    const steady = clock.target(1000);
    clock.heardRtt(400, 1000 + 10 * PING_EVERY_MS);
    expect(clock.target(1000)).toBe(steady);
    for (let sample = 11; sample < 15; sample += 1) {
      clock.heardRtt(400, 1000 + sample * PING_EVERY_MS);
    }
    expect(clock.target(1000)).toBe(steady + 18);
  });

  it("leaves out pongs a hold in the lobby released together, before any tick", () => {
    const clock = createRoomClock();
    for (let sample = 0; sample < 6; sample += 1) {
      clock.heardRtt(100, sample * PING_EVERY_MS);
    }
    const steady = clock.target(3000);
    for (let sample = 6; sample < 11; sample += 1) {
      clock.heardRtt(5600 - sample * PING_EVERY_MS, 5600);
    }
    expect(clock.target(3000)).toBe(steady);
  });

  it("calls a lead bloated when it runs far past what the round trip needs", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(100, 1000);
    expect(clock.leadBloated(118, 1000)).toBeFalsy();
    expect(clock.leadBloated(120, 1000)).toBeTruthy();
    clock.heardRtt(400, 1000 + PING_EVERY_MS);
    expect(clock.leadBloated(126, 1000)).toBeFalsy();
  });

  it("holds a control at the room for the two-tick margin on a steady link", () => {
    expect(heldTicksAfter(() => 0, STALLED_UNTIL_MS)).toBe(2);
  });

  it("forgets ticks heard late while the race loads within a few seconds", () => {
    expect(heldTicksAfter(stalledAtStart, STALLED_UNTIL_MS + 3000)).toBe(2);
  });

  it("does not read a few seconds of slower delivery as jitter", () => {
    const slowerPerMs = 0.017;
    expect(
      heldTicksAfter((sentAt) => sentAt * slowerPerMs, STALLED_UNTIL_MS)
    ).toBeLessThanOrEqual(4);
  });

  it.each([
    [108, 1],
    [111, 0.94],
    [150, 0.9],
    [102, 1.02],
  ])(
    "eases its speed by at most a tenth, and slows only once more than five ticks ahead, at tick %i",
    (predicted, pace) => {
      const clock = createRoomClock();
      clock.heardRtt(1, 1000);
      clock.heardTick(100, 1000);
      expect(clock.pace(predicted, 100, 1000)).toBeCloseTo(pace, 9);
      expect(clock.stepsDue(predicted, 100, 1000)).toBe(1);
    }
  );

  it("moves its speed toward a new pace by at most a tenth a second", () => {
    const clock = createRoomClock();
    clock.heardRtt(1, 1000);
    clock.heardTick(100, 1000);
    expect(clock.pace(150, 100, 1000)).toBeCloseTo(0.9, 9);
    expect(clock.pace(102, 100, 1100)).toBeCloseTo(0.91, 9);
    expect(clock.pace(102, 100, 1100)).toBeCloseTo(0.91, 9);
    expect(clock.pace(102, 100, 1600)).toBeCloseTo(0.96, 9);
  });

  it("slows toward a stop only as its guess nears seven seconds past the last tick it heard, after the link is given up", () => {
    const clock = createRoomClock();
    clock.heardRtt(1, 1000);
    clock.heardTick(100, 1000);
    const now = 1000 + INPUT_HORIZON * TICK_MS;
    expect(clock.pace(490, 100, now)).toBeCloseTo(1.1, 9);
    expect(clock.pace(505, 100, now)).toBeCloseTo(0.5, 9);
    expect(clock.pace(520, 100, now)).toBe(0);
    expect(clock.stepsDue(520, 100, now)).toBe(0);
  });

  it("follows a room that sends 57 ticks a second instead of running away from it", () => {
    const clock = createRoomClock();
    clock.heardRtt(100, 1000);
    const slowTickMs = 1000 / 57;
    let tick = 0;
    for (; tick * slowTickMs < 30_000; tick += 1) {
      clock.heardTick(tick, tick * slowTickMs + ONE_WAY_MS);
    }
    const now = tick * slowTickMs + ONE_WAY_MS;
    expect(clock.target(now) - tick).toBeLessThanOrEqual(STEADY_LEAD + 6);
  });
});
