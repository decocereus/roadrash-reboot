import { riderIdAt } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { clearDrift, driftBy, driftSettle, stillDrift } from "./rider-drift.ts";

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

  it("snaps a correction too big to be steering, such as a crash", () => {
    const drift = stillDrift();
    driftBy(drift, { ...moved, x: 4 });
    expect(drift.x).toBe(0);
  });

  it("stops when cleared", () => {
    const drift = stillDrift();
    driftBy(drift, moved);
    clearDrift(drift);
    expect(drift.x).toBe(0);
  });
});
