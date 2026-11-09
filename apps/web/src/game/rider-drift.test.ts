import { riderIdAt } from "@racer/sim/state";
import { kick, punch } from "@racer/sim/weapons";
import { describe, expect, it } from "vitest";

import {
  captureCast,
  clearDrift,
  driftBy,
  drawnOff,
  driftSettle,
  placeDrawn,
  stillDrawn,
  stillDrift,
} from "./rider-drift.ts";

const FRAME = 1 / 60;
const SPEED = 50;
const moved = {
  air: 0,
  heading: 0,
  lateralSpeed: 0,
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

const HALF_REACH_ACROSS = punch.reachX / 2;
const HALF_REACH_ALONG = punch.reachS / 2;
const MOST_STEP_METRES = 0.2;

const framesUntilWithin = (
  drift: ReturnType<typeof stillDrift>,
  axis: "s" | "x",
  within: number,
  speed: number,
  most: number
) => {
  let step = 0;
  for (let frame = 1; frame <= most; frame += 1) {
    const from = drift[axis];
    driftSettle(drift, FRAME, speed);
    step = Math.max(step, Math.abs(drift[axis] - from));
    if (Math.abs(drift[axis]) < within) {
      return { frames: frame, step };
    }
  }
  return { frames: Number.POSITIVE_INFINITY, step };
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

  it("glides even a 60 m correction no faster than a quarter of the bike's speed, closing it in about six seconds", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 60, x: 9 });
    expect({ s: drift.s, x: drift.x }).toStrictEqual({ s: 60, x: 9 });
    const { fastest } = settleFor(drift, 360, SPEED);
    expect(fastest).toBeLessThanOrEqual(SPEED * 0.25 + 1e-9);
    expect(Math.max(Math.abs(drift.s), Math.abs(drift.x))).toBeLessThan(0.01);
  });

  it("glides a correction inside half a bare-hand reach no faster than a tenth of the bike's speed", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: HALF_REACH_ALONG, x: 0 });
    const { fastest } = settleFor(drift, 120, SPEED);
    expect(fastest).toBeLessThanOrEqual(SPEED * 0.1 + 1e-9);
    expect(Math.abs(drift.s)).toBeLessThan(0.01);
  });

  it("brings a bike drawn a full reach across off its place back inside half a reach within a strike and a third, and onto it within a second, stepping under 20 cm a frame", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, x: punch.reachX });
    const trusted = framesUntilWithin(drift, "x", HALF_REACH_ACROSS, SPEED, 60);
    const home = framesUntilWithin(drift, "x", 0.01, SPEED, 60);
    expect(trusted.frames).toBeLessThanOrEqual(Math.ceil((kick.ticks * 4) / 3));
    expect(trusted.frames + home.frames).toBeLessThanOrEqual(60);
    expect(Math.max(trusted.step, home.step)).toBeLessThan(MOST_STEP_METRES);
  });

  it("brings a bike drawn 3 m along off its place at 25 m/s back inside half a reach within two strikes, and onto it within a second and a half", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, s: 3, x: 0 });
    const trusted = framesUntilWithin(drift, "s", HALF_REACH_ALONG, 25, 90);
    const home = framesUntilWithin(drift, "s", 0.01, 25, 90);
    expect(trusted.frames).toBeLessThanOrEqual(2 * kick.ticks);
    expect(trusted.frames + home.frames).toBeLessThanOrEqual(90);
    expect(Math.max(trusted.step, home.step)).toBeLessThan(MOST_STEP_METRES);
  });

  it("keeps a bike's drawn speed through a correction that changes it, then changes it no faster than hard braking", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, speed: -43, x: 0 });
    expect(drift.along).toBe(-43);
    const { mostChange } = settleFor(drift, 900, 63);
    expect(mostChange).toBeLessThanOrEqual(25 * FRAME + 1e-9);
    expect(Math.abs(drift.s)).toBeLessThan(0.01);
  });

  it("keeps a bike's drawn sideways speed through a correction that changes it, then changes it no faster than hard braking", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, lateralSpeed: 1.06, x: 0 });
    expect(drift.across).toBe(1.06);
    let mostChange = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      const { across } = drift;
      driftSettle(drift, FRAME, SPEED);
      mostChange = Math.max(mostChange, Math.abs(drift.across - across));
    }
    expect(mostChange).toBeLessThanOrEqual(25 * FRAME + 1e-9);
    expect(Math.abs(drift.x)).toBeLessThan(0.01);
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

const placed = (x: number) => ({ air: 0, heading: 0, lean: 0, s: 0, x });

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

const tickedPose = () => ({
  air: 0,
  heading: 0,
  lean: 0,
  s: 0,
  tick: 0,
  x: 0,
});

describe("a bike's height on screen", () => {
  it("stays where it was drawn when a correction lifts it, then settles onto the riding", () => {
    const lifted = 0.0153;
    const view = {
      after: tickedPose(),
      before: tickedPose(),
      drawn: stillDrawn(),
      drift: stillDrift(),
    };
    const rider = { mode: "riding", speed: SPEED };
    placeDrawn(view, rider, 0, FRAME);
    captureCast(
      "before",
      [{ air: lifted }],
      [view],
      [{ ...moved, air: -lifted, rider: riderIdAt(0), x: 0 }],
      (shown, posed) => {
        posed.air = shown.air;
      }
    );
    view.after.air = lifted;
    const drawnAfter = (frames: number) => {
      for (let frame = 0; frame < frames; frame += 1) {
        placeDrawn(view, rider, 0, FRAME);
      }
      return view.drawn.air;
    };
    expect(drawnAfter(1)).toBeLessThan(lifted * 0.2);
    expect(drawnAfter(40)).toBeCloseTo(lifted, 4);
  });
});

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
  readonly ridingAcross?: number;
  readonly ridingSeconds?: number;
  readonly swerved?: number;
}

const offOver = (first: Framed, second: Framed, unseen = false): number => {
  const last = {
    drawnAcrossRate: 0,
    drawnAlongRate: 0,
    ridingAcrossRate: 0,
    ridingAlongRate: 0,
  };
  const measure = (frame: Framed, measured = true): number =>
    drawnOff(
      measured,
      frame.along,
      frame.riding,
      frame.across ?? 0,
      frame.ridingAcross ?? 0,
      frame.ridingSeconds ?? FRAME,
      { kicked: frame.kicked ?? 0, swerved: frame.swerved ?? 0 },
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

const sliding = (metresPerSecond: number): Framed => ({
  ...at(SPEED),
  across: metresPerSecond * FRAME,
  ridingAcross: metresPerSecond * FRAME,
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
    [
      "at its old sideways speed after a correction slowed it from 2.44 to 1.38 m/s",
      sliding(2.44),
      { ...sliding(1.38), across: 2.44 * FRAME, swerved: 1.06 },
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
      "sliding sideways at 3 m/s from one frame to the next",
      at(SPEED),
      { ...at(SPEED), across: 3 * FRAME },
    ],
    [
      "slowing from 2.44 to 1.38 m/s sideways with a correction",
      sliding(2.44),
      { ...sliding(1.38), swerved: 1.06 },
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
