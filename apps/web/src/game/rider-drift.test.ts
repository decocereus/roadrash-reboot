import { riderIdAt } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import {
  captureCast,
  clearDrift,
  driftBy,
  driftSettle,
  stillDrift,
} from "./rider-drift.ts";

const FRAME = 1 / 60;
const moved = { heading: 0, lean: 0, rider: riderIdAt(1), s: 0, x: 1 };

describe("how a corrected rider settles on screen", () => {
  it("keeps the rider where they were drawn the moment the correction arrives", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    expect(drift.x).toBe(1);
  });

  it("moves them about a sixth of the way each frame, not all at once", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    driftSettle(drift, FRAME);
    expect(1 - drift.x).toBeLessThan(0.2);
    expect(1 - drift.x).toBeGreaterThan(0.1);
  });

  it("has them on their true line within half a second", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    driftSettle(drift, 0.5);
    expect(drift.x).toBeLessThan(0.01);
  });

  it("glides the biggest correction a production race showed, 6.5 m along the road", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 6.46, x: 0 });
    expect(drift.s).toBe(6.46);
    driftSettle(drift, FRAME);
    expect(6.46 - drift.s).toBeLessThan(1.5);
  });

  it("glides a rider pushed a lane across", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, x: 4 });
    expect(drift.x).toBe(4);
  });

  it("snaps a correction too big to be riding, such as a respawn", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 20, x: 0 });
    expect(drift.s).toBe(0);
  });

  it("stops when cleared", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    clearDrift(drift);
    expect(drift.x).toBe(0);
  });
});

const DRAWN = 1.8;
const GUESSED = 2.078;
const corrected = { ...moved, x: DRAWN - GUESSED };

const placed = (x: number) => ({ heading: 0, lean: 0, s: 0, x });

const castAt = (before: number, after: number) => [
  { after: placed(0), before: placed(0), drift: stillDrift() },
  { after: placed(after), before: placed(before), drift: stillDrift() },
];

const ridersAt = (x: number) => [placed(0), placed(x)];

const copy = (rider: { readonly x: number }, pose: { x: number }) => {
  pose.x = rider.x;
};

const drawnAt = (
  view: ReturnType<typeof castAt>[number] | undefined,
  blend: number
) =>
  view === undefined
    ? Number.NaN
    : view.before.x + (view.after.x - view.before.x) * blend + view.drift.x;

describe("when a correction reaches the cast", () => {
  it("keeps the rider in place when a confirm corrected them between frames", () => {
    const views = castAt(DRAWN, DRAWN);
    captureCast("before", ridersAt(GUESSED), views, [corrected], copy);
    expect(drawnAt(views[1], 0)).toBeCloseTo(DRAWN);
  });

  it("keeps the rider in place when a step corrected them mid-frame", () => {
    const views = castAt(DRAWN, DRAWN);
    captureCast("after", ridersAt(GUESSED), views, [corrected], copy);
    expect(drawnAt(views[1], 0)).toBeCloseTo(DRAWN);
    expect(drawnAt(views[1], 1)).toBeCloseTo(DRAWN);
  });
});
