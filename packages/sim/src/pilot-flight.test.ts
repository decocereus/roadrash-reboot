import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { pilotInput } from "./pilot.ts";
import {
  KMH,
  alone,
  cruising,
  field,
  player,
  quietTrack,
  rampRoad,
} from "./race-fixtures.ts";
import { neutralInput, stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type { RaceEvent } from "./state.ts";

describe("gears and the tuck", () => {
  it("the pilot lifts for the Saddle on the fastest bike and lands without crashing", () => {
    const state = alone(quietTrack, bikes["ostra-nera-1000"]);
    const rider = player(state);
    rider.s = 1900;
    rider.speed = 70;
    rider.gear = 6;
    const input = { ...cruising, throttle: 0 };
    const events: RaceEvent[] = [];
    let launchSpeed = 0;
    for (let tick = 0; tick < 12 * TICK_RATE; tick += 1) {
      pilotInput(state, quietTrack, 0, input);
      stepRace(state, quietTrack, [input]);
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

describe("jumping", () => {
  it("computer riders line up on a ramp and land it, and the odd unsure one misjudges it and goes down", () => {
    let jumped = 0;
    let passed = 0;
    let downAtRamp = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      const state = field(rampRoad, seed, 6, 0);
      const inputs = state.riders.map(() => ({ ...neutralInput }));
      for (let tick = 0; tick < 60 * TICK_RATE; tick += 1) {
        for (const [index, input] of inputs.entries()) {
          pilotInput(state, rampRoad, index, input);
        }
        const before = state.riders.map((rider) => rider.s);
        stepRace(state, rampRoad, inputs);
        for (const [index, rider] of state.riders.entries()) {
          if ((before[index] ?? 0) <= 1016 && rider.s > 1016) {
            passed += 1;
            jumped += rider.airborne ? 1 : 0;
          }
        }
        for (const event of state.events) {
          const crashed =
            event.kind === "crash" ? state.riders[event.rider] : undefined;
          if (crashed && crashed.s > 990 && crashed.s < 1100) {
            downAtRamp += 1;
          }
        }
        if (state.riders.every((rider) => rider.s > 1200)) {
          break;
        }
      }
    }
    expect(passed).toBeGreaterThan(140);
    expect(jumped / passed).toBeGreaterThan(0.75);
    expect(downAtRamp).toBeGreaterThan(0);
    expect(downAtRamp / passed).toBeLessThan(0.1);
  });
});
