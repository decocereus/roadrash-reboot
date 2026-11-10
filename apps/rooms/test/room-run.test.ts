import { controlOf } from "@racer/sim/control";
import { neutralInput } from "@racer/sim/race";
import { clearFrame, createTickFrame } from "@racer/sim/room-frame";
import { riderIdAt, TICK_SECONDS } from "@racer/sim/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInputLatency } from "../src/input-latency.ts";
import { createRoomRun } from "../src/room-run.ts";
import { FakeSocket, loadingSeat } from "./seat-socket.ts";

const TICK_MS = TICK_SECONDS * 1000;
const throttle = controlOf({ ...neutralInput, throttle: 1 });

describe("a room run's input to frame latency", () => {
  beforeEach(() => {
    FakeSocket.opened = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs until the race takes the control, counting the ticks it was planned ahead", () => {
    const { seat } = loadingSeat();
    const race = seat.race();
    if (!race) {
      throw new Error("The seat has no race.");
    }
    let nowMs = 0;
    const latency = createInputLatency(
      () => nowMs,
      (done) => {
        done();
      }
    );
    const run = createRoomRun(seat, race, "friday-ride", latency);
    const delay = seat.inputDelay();
    const frame = createTickFrame();
    latency.pressed();
    for (let tick = 1; tick <= delay + 2; tick += 1) {
      clearFrame(frame, tick);
      frame.controls.set(riderIdAt(0), throttle);
      run.step(frame);
      nowMs += TICK_MS;
    }
    expect(delay).toBeGreaterThan(0);
    expect(latency.summary().worstMs).toBeCloseTo(delay * TICK_MS);
  });
});
