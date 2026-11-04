import { describe, expect, it } from "vitest";

import { createRoomClock } from "./room-clock.ts";
import { TICK_SECONDS } from "./state.ts";

const TICK_MS = TICK_SECONDS * 1000;

const roomTick = (atMs: number): number => Math.floor(atMs / TICK_MS);

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
    clock.heardRtt(100);
    expect(clock.target(1000)).toBe(108);
  });

  it.each([0, 20, 100, 200])(
    "lands a control before its tick over a %i ms round trip",
    (rttMs) => {
      const clock = createRoomClock();
      const now = 5000;
      clock.heardRtt(rttMs);
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
    clock.heardRtt(0);
    expect(clock.target(1000)).toBe(102);
  });

  it("steps once a tick while the lead wobbles by one", () => {
    const clock = createRoomClock();
    clock.heardRtt(1);
    clock.heardTick(100, 1000);
    expect(clock.stepsDue(102, 1000)).toBe(1);
    expect(clock.stepsDue(103, 1000)).toBe(1);
    expect(clock.stepsDue(104, 1000)).toBe(1);
  });

  it("does not move its idea of the server back when a tick arrives late", () => {
    const clock = createRoomClock();
    clock.heardRtt(0);
    clock.heardTick(100, 1000);
    const onTime = clock.target(1000 + TICK_MS);
    clock.heardTick(101, 1000 + TICK_MS + 150);
    expect(clock.target(1000 + TICK_MS + 150)).toBeGreaterThanOrEqual(
      onTime + 8
    );
  });

  it("follows a route that got slower, a little at a time", () => {
    const clock = createRoomClock();
    clock.heardRtt(0);
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
      clock.heardRtt(300);
    }
    clock.heardTick(309, 5000);
    expect(clock.stepsDue(312, 5000)).toBe(4);
    expect(clock.stepsDue(316, 5000)).toBe(4);
  });

  it("does not rush for one slow round trip", () => {
    const clock = createRoomClock();
    for (let sample = 0; sample < 9; sample += 1) {
      clock.heardRtt(100);
    }
    clock.heardRtt(400);
    clock.heardTick(100, 5000);
    expect(clock.stepsDue(108, 5000)).toBeLessThanOrEqual(2);
    expect(clock.stepsDue(109, 5000)).toBe(1);
  });

  it("keeps the lead for the worst of its recent round trips", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(100);
    clock.heardRtt(300);
    for (let sample = 0; sample < 8; sample += 1) {
      clock.heardRtt(100);
    }
    expect(clock.target(1000)).toBe(120);
    clock.heardRtt(100);
    clock.heardRtt(100);
    expect(clock.target(1000)).toBe(108);
  });

  it("eases the lead up and down a step at a time when a round trip changes", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(100);
    let predicted = 108;
    clock.heardRtt(300);
    const steps: number[] = [];
    for (let frame = 0; frame < 12; frame += 1) {
      const due = clock.stepsDue(predicted, 1000);
      steps.push(due);
      predicted += due;
    }
    expect(Math.max(...steps)).toBe(2);
    expect(steps.filter((due) => due === 2)).toHaveLength(2);
    expect(steps).not.toContain(0);
  });

  it("skips a step when far ahead and catches up when behind, at most four", () => {
    const clock = createRoomClock();
    clock.heardRtt(1);
    clock.heardTick(100, 1000);
    expect(clock.stepsDue(106, 1000)).toBe(0);
    expect(clock.stepsDue(101, 1000)).toBe(2);
    expect(clock.stepsDue(50, 1000)).toBe(4);
  });
});
