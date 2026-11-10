import { describe, expect, it } from "vitest";

import { createInputLatency } from "../src/input-latency.ts";

const rig = () => {
  let at = 0;
  const frames: (() => void)[] = [];
  const latency = createInputLatency(
    () => at,
    (done) => {
      frames.push(done);
    }
  );
  return {
    latency,
    move: (ms: number) => {
      at += ms;
    },
    nextFrame: () => {
      frames.shift()?.();
    },
  };
};

describe("input to frame latency", () => {
  it("runs from the press to the frame after the race took the changed control", () => {
    const { latency, move, nextFrame } = rig();
    latency.pressed();
    move(10);
    latency.controlChanged(30);
    move(500);
    latency.reached(30);
    move(16);
    nextFrame();
    expect(latency.summary()).toStrictEqual({
      medianMs: 526,
      samples: 1,
      worstMs: 526,
    });
  });

  it("keeps timing the first press while later ones change the control again", () => {
    const { latency, move, nextFrame } = rig();
    latency.pressed();
    latency.controlChanged(30);
    for (let tick = 31; tick <= 60; tick += 1) {
      move(10);
      latency.pressed();
      latency.controlChanged(tick);
      latency.reached(tick - 30);
    }
    nextFrame();
    expect(latency.summary()).toStrictEqual({
      medianMs: 300,
      samples: 1,
      worstMs: 300,
    });
  });

  it("ignores a control that changed with no press behind it", () => {
    const { latency, nextFrame } = rig();
    latency.controlChanged(0);
    latency.reached(0);
    nextFrame();
    expect(latency.summary().samples).toBe(0);
  });

  it("drops a press that changed nothing for half a second", () => {
    const { latency, move, nextFrame } = rig();
    latency.pressed();
    move(501);
    latency.controlChanged(0);
    latency.reached(0);
    nextFrame();
    expect(latency.summary().samples).toBe(0);
  });

  it("counts a second press held down over the first from the first", () => {
    const { latency, move, nextFrame } = rig();
    latency.pressed();
    move(5);
    latency.pressed();
    latency.controlChanged(0);
    latency.reached(0);
    nextFrame();
    expect(latency.summary().worstMs).toBe(5);
  });
});
