import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { KMH, alone, frameOf, player, quietTrack } from "./race-fixtures.ts";
import { stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type { RaceEvent } from "./state.ts";

describe("gears and the tuck", () => {
  it("the pilot lifts for the Saddle on the fastest bike and lands without crashing", () => {
    const state = alone(quietTrack, bikes["ostra-nera-1000"]);
    const rider = player(state);
    rider.s = 1900;
    rider.speed = 70;
    rider.gear = 6;
    rider.controller = "pilot";
    const events: RaceEvent[] = [];
    let launchSpeed = 0;
    for (let tick = 0; tick < 12 * TICK_RATE; tick += 1) {
      stepRace(state, quietTrack, frameOf(state));
      if (rider.airborne && launchSpeed === 0) {
        launchSpeed = rider.speed;
      }
      events.push(...state.events);
    }
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    expect(events.some((event) => event.kind === "land")).toBeTruthy();
    expect(launchSpeed * KMH).toBeGreaterThan(170);
    expect(launchSpeed * KMH).toBeLessThan(205);
  });
});
