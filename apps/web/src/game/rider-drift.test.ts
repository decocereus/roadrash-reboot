import { riderIdAt } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import {
  captureCast,
  clearDrift,
  driftBy,
  drawnOff,
  driftSettle,
  stillDrift,
} from "./rider-drift.ts";

const FRAME = 1 / 60;
const SPEED = 50;
const moved = {
  heading: 0,
  lean: 0,
  rider: riderIdAt(1),
  s: 0,
  speed: 0,
  x: 1,
};

const settleFor = (
  drift: ReturnType<typeof stillDrift>,
  frames: number,
  speed: number
) => {
  let fastest = 0;
  let mostChange = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const { along, s: from } = drift;
    driftSettle(drift, FRAME, speed);
    fastest = Math.max(fastest, Math.abs(drift.s - from) / FRAME);
    mostChange = Math.max(mostChange, Math.abs(drift.along - along));
  }
  return { fastest, mostChange };
};

describe("how a corrected rider settles on screen", () => {
  it("keeps the rider where they were drawn the moment the correction arrives", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    expect(drift.x).toBe(1);
  });

  it("eases into a small slip instead of starting it at full speed", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, x: 0.2 });
    driftSettle(drift, FRAME, SPEED);
    expect(0.2 - drift.x).toBeGreaterThan(0);
    expect(0.2 - drift.x).toBeLessThan(0.01);
  });

  it("has a rider a metre off their line back on it within two thirds of a second", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    settleFor(drift, 40, SPEED);
    expect(Math.abs(drift.x)).toBeLessThan(0.01);
  });

  it("still settles a stopped bike", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 1, x: 0 });
    settleFor(drift, 240, 0);
    expect(Math.abs(drift.s)).toBeLessThan(0.01);
  });

  it("glides even a 60 m correction no faster than a tenth of the bike's speed, closing it in about thirteen seconds", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 60, x: 9 });
    expect({ s: drift.s, x: drift.x }).toStrictEqual({ s: 60, x: 9 });
    const { fastest } = settleFor(drift, 800, SPEED);
    expect(fastest).toBeLessThanOrEqual(SPEED * 0.1 + 1e-9);
    expect(Math.max(Math.abs(drift.s), Math.abs(drift.x))).toBeLessThan(0.01);
  });

  it("keeps a bike's drawn speed through a correction that changes it, then changes it no faster than hard braking", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, speed: -43, x: 0 });
    expect(drift.along).toBe(-43);
    const { mostChange } = settleFor(drift, 900, 63);
    expect(mostChange).toBeLessThanOrEqual(25 * FRAME + 1e-9);
    expect(Math.abs(drift.s)).toBeLessThan(0.01);
  });

  it("stops when cleared", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, speed: 5 });
    clearDrift(drift);
    expect([drift.x, drift.along]).toStrictEqual([0, 0]);
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

interface Framed {
  readonly across?: number;
  readonly along: number;
  readonly kicked?: number;
  readonly riding: number;
  readonly ridingSeconds?: number;
}

const offOver = (first: Framed, second: Framed, unseen = false): number => {
  const last = { drawnRate: 0, ridingRate: 0 };
  const measure = (frame: Framed, measured = true): number =>
    drawnOff(
      measured,
      frame.along,
      frame.riding,
      frame.across ?? 0,
      0,
      frame.ridingSeconds ?? FRAME,
      frame.kicked ?? 0,
      SPEED,
      FRAME,
      last
    );
  measure(first);
  if (unseen) {
    measure(first, false);
  }
  return measure(second);
};

const at = (metresPerSecond: number): Framed => ({
  along: metresPerSecond * FRAME,
  riding: metresPerSecond * FRAME,
});

describe("how far a frame draws a bike off its riding", () => {
  it.each([
    ["at a steady speed", at(SPEED), at(SPEED)],
    [
      "as its race speeds it up, a pace easing a tenth a second on top",
      at(SPEED),
      { along: (SPEED + 0.4) * FRAME * 1.0017, riding: (SPEED + 0.4) * FRAME },
    ],
    [
      "where a bump in the race pushed it a metre",
      at(SPEED),
      { along: SPEED * FRAME + 1, riding: SPEED * FRAME + 1 },
    ],
    [
      "at its old speed after a correction raised it from 20 to 63 m/s",
      at(20),
      { along: 20 * FRAME, kicked: -43, riding: 63 * FRAME },
    ],
  ] as const)("counts nothing for a bike drawn %s", (_name, first, second) => {
    expect(offOver(first, second)).toBe(0);
  });

  it("counts nothing for a bike back on the road at another speed after frames it did not measure", () => {
    const remounted = { along: 2 * FRAME, riding: 19 * FRAME };
    expect(offOver(at(30), remounted, true)).toBe(0);
    expect(offOver(at(30), remounted)).toBeGreaterThan(0.008);
  });

  it.each([
    [
      "jumping from 20 to 63 m/s with a correction",
      at(20),
      { along: 63 * FRAME, kicked: -43, riding: 63 * FRAME },
    ],
    [
      "three tenths faster from one frame to the next",
      at(SPEED),
      { along: 1.3 * SPEED * FRAME, riding: SPEED * FRAME },
    ],
    [
      "gliding sideways at 3 m/s",
      at(SPEED),
      { ...at(SPEED), across: 3 * FRAME },
    ],
    [
      "two ticks on in one frame",
      at(SPEED),
      { ...at(2 * SPEED), ridingSeconds: 2 * FRAME },
    ],
  ] as const)("counts a bike drawn %s", (_name, first, second) => {
    expect(offOver(first, second)).toBeGreaterThan(0.008);
  });
});
