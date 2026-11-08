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
const SPEED = 50;
const moved = { heading: 0, lean: 0, rider: riderIdAt(1), s: 0, x: 1 };

describe("how a corrected rider settles on screen", () => {
  it("keeps the rider where they were drawn the moment the correction arrives", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    expect(drift.x).toBe(1);
  });

  it("settles a small slip by the frame, not all at once", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, x: 0.2 });
    driftSettle(drift, FRAME, SPEED);
    expect(0.2 - drift.x).toBeLessThan(0.04);
    expect(0.2 - drift.x).toBeGreaterThan(0.02);
  });

  it("has a rider a metre off their line back on it within two thirds of a second", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    for (let frame = 0; frame < 40; frame += 1) {
      driftSettle(drift, FRAME, SPEED);
    }
    expect(drift.x).toBeLessThan(0.01);
  });

  it("glides 6.5 m along the road no faster than a tenth of the bike's speed", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 6.46, x: 0 });
    expect(drift.s).toBe(6.46);
    driftSettle(drift, FRAME, SPEED);
    expect(6.46 - drift.s).toBeCloseTo((SPEED * 0.1) / 60);
  });

  it("still settles a stopped bike", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 1, x: 0 });
    for (let frame = 0; frame < 180; frame += 1) {
      driftSettle(drift, FRAME, 0);
    }
    expect(drift.s).toBeLessThan(0.01);
  });

  it("glides a rider pushed a lane across at a steady sideways speed", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, x: 4 });
    expect(drift.x).toBe(4);
    driftSettle(drift, FRAME, SPEED);
    expect(4 - drift.x).toBeCloseTo(2.5 / 60);
  });

  it("glides a correction too big for a tenth of the speed over a few seconds, never jumping", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 60, x: 9 });
    expect({ s: drift.s, x: drift.x }).toStrictEqual({ s: 60, x: 9 });
    driftSettle(drift, FRAME, SPEED);
    expect(60 - drift.s).toBeCloseTo(60 / 2 / 60);
    expect(9 - drift.x).toBeCloseTo(9 / 2 / 60);
    for (let frame = 1; frame < 360; frame += 1) {
      driftSettle(drift, FRAME, SPEED);
    }
    expect(Math.max(drift.s, drift.x)).toBeLessThan(0.01);
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
