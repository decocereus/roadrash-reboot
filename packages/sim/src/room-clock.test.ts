import { describe, expect, it } from "vitest";

import { createRoomClock } from "./room-clock.ts";
import { TICK_SECONDS } from "./state.ts";

const TICK_MS = TICK_SECONDS * 1000;

describe("the room clock", () => {
  it("waits through the countdown until the lead reaches the first tick", () => {
    const clock = createRoomClock();
    clock.start(3000, 0);
    expect(clock.stepsDue(0, 0)).toBe(0);
    expect(clock.stepsDue(0, 3000 - TICK_MS * 8)).toBe(0);
    expect(clock.stepsDue(0, 3000)).toBe(4);
  });

  it("leads the server by half the round trip and a margin", () => {
    const clock = createRoomClock();
    clock.heardTick(100, 1000);
    clock.heardRtt(100);
    expect(clock.target(1000)).toBe(105);
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

  it("skips a step when far ahead and catches up when behind, at most four", () => {
    const clock = createRoomClock();
    clock.heardRtt(1);
    clock.heardTick(100, 1000);
    expect(clock.stepsDue(106, 1000)).toBe(0);
    expect(clock.stepsDue(101, 1000)).toBe(2);
    expect(clock.stepsDue(50, 1000)).toBe(4);
  });
});
