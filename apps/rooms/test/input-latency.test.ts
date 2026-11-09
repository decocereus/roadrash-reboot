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
    latency.controlChanged();
    move(500);
    latency.controlApplied();
    move(16);
    nextFrame();
    expect(latency.summary()).toStrictEqual({
      medianMs: 526,
      samples: 1,
      worstMs: 526,
    });
  });

  it("ignores a control that changed with no press behind it", () => {
    const { latency, nextFrame } = rig();
    latency.controlChanged();
    latency.controlApplied();
    nextFrame();
    expect(latency.summary().samples).toBe(0);
  });

  it("drops a press that changed nothing for half a second", () => {
    const { latency, move, nextFrame } = rig();
    latency.pressed();
    move(501);
    latency.controlChanged();
    latency.controlApplied();
    nextFrame();
    expect(latency.summary().samples).toBe(0);
  });

  it("counts a second press held down over the first from the first", () => {
    const { latency, move, nextFrame } = rig();
    latency.pressed();
    move(5);
    latency.pressed();
    latency.controlChanged();
    latency.controlApplied();
    nextFrame();
    expect(latency.summary().worstMs).toBe(5);
  });
});
