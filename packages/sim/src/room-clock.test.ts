import { describe, expect, it } from "vitest";

import { createRoomClock } from "./room-clock.ts";
import { TICK_SECONDS } from "./state.ts";

const TICK_MS = TICK_SECONDS * 1000;

const roomTick = (atMs: number): number => Math.floor(atMs / TICK_MS);
const FADED_MS = 6000;
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
    predicted = Math.max(predicted, tick) + clock.stepsDue(predicted, now);
    leads.set(Math.round(now / 100) * 100, predicted - tick);
  }
  return (atMs: number): number => leads.get(atMs) ?? Number.NaN;
};

describe("the room clock", () => {
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
    expect(clock.stepsDue(0, 0)).toBe(0);
    expect(clock.stepsDue(0, 3000 - TICK_MS * 8)).toBe(0);
    expect(clock.stepsDue(0, 3000)).toBe(4);
  });

  it("leads the tick it heard by the whole round trip and a margin", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(100, 0);
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
    clock.heardRtt(0, 0);
    expect(clock.target(1000)).toBe(102);
  });

  it("steps once a tick while the lead wobbles by one", () => {
    const clock = createRoomClock();
    clock.heardRtt(1, 0);
    clock.heardTick(100, 1000);
    expect(clock.stepsDue(102, 1000)).toBe(1);
    expect(clock.stepsDue(103, 1000)).toBe(1);
    expect(clock.stepsDue(104, 1000)).toBe(1);
  });

  it("does not move its idea of the server back when a tick arrives late", () => {
    const clock = createRoomClock();
    clock.heardRtt(0, 0);
    clock.heardTick(100, 1000);
    const onTime = clock.target(1000 + TICK_MS);
    clock.heardTick(101, 1000 + TICK_MS + 150);
    expect(clock.target(1000 + TICK_MS + 150)).toBeGreaterThanOrEqual(
      onTime + 8
    );
  });

  it("follows a route that got slower, a little at a time", () => {
    const clock = createRoomClock();
    clock.heardRtt(0, 0);
    clock.heardTick(0, 0);
    const slower = 100;
    for (let at = 0; at <= 60_000; at += 1000) {
      clock.heardTick(roomTick(at), at + slower);
    }
    expect(clock.target(60_000 + slower)).toBeLessThanOrEqual(
      roomTick(60_000) + 2 + 2
    );
  });

  it("catches up at once when its controls would reach the room too late", () => {
    const clock = createRoomClock();
    for (let sample = 0; sample < 10; sample += 1) {
      clock.heardRtt(300, 0);
    }
    clock.heardTick(309, 5000);
    expect(clock.stepsDue(312, 5000)).toBe(4);
    expect(clock.stepsDue(316, 5000)).toBe(4);
  });

  it("sizes the lead from the typical round trip, not the worst", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(300, 0);
    for (let sample = 0; sample < 9; sample += 1) {
      clock.heardRtt(100, 0);
    }
    expect(clock.target(1000 + FADED_MS)).toBe(
      roomTick(1000 + FADED_MS) - roomTick(1000) + 108
    );
  });

  it("rises at once on a slow round trip and is back within about three seconds", () => {
    const lead = riddenLead([{ atMs: 10_000, rttMs: 1000 }]);
    expect(lead(9900)).toBe(STEADY_LEAD);
    expect(lead(10_300)).toBeGreaterThanOrEqual(40);
    expect(lead(13_000)).toBeLessThanOrEqual(STEADY_LEAD + 3);
  });

  it("rises once for each run of lost controls, and not for ticks it never predicted", () => {
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
    expect(clock.target(1000 + FADED_MS)).toBe(
      steady + roomTick(1000 + FADED_MS) - roomTick(1000)
    );
  });

  it("counts a slow ping once when the typical round trip rises to meet it", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    for (let sample = 0; sample < 10; sample += 1) {
      clock.heardRtt(100, 1000);
    }
    for (let sample = 0; sample < 5; sample += 1) {
      clock.heardRtt(400, 1000 + sample * PING_EVERY_MS);
    }
    const always = createRoomClock();
    always.heardTick(100, 1000);
    always.heardRtt(400, 1000);
    const now = 1000 + 4 * PING_EVERY_MS;
    expect(clock.target(now)).toBe(always.target(now));
  });

  it("calls a lead bloated when it runs far past what the round trip needs", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(100, 1000);
    expect(clock.leadBloated(118, 1000)).toBeFalsy();
    expect(clock.leadBloated(120, 1000)).toBeTruthy();
    clock.heardRtt(400, 1000);
    expect(clock.leadBloated(126, 1000)).toBeFalsy();
  });

  it("skips a step when far ahead and catches up when behind, at most four", () => {
    const clock = createRoomClock();
    clock.heardRtt(1, 0);
    clock.heardTick(100, 1000);
    expect(clock.stepsDue(106, 1000)).toBe(0);
    expect(clock.stepsDue(101, 1000)).toBe(2);
    expect(clock.stepsDue(50, 1000)).toBe(4);
  });
});
