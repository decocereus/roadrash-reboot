import { describe, expect, it } from "vitest";

import { spawnOil, spawnPothole, spawnRock } from "./hazards.ts";
import { pilotInput } from "./pilot.ts";
import {
  KMH,
  field,
  flatOut,
  hazardFreeRoad,
  hold,
  pilotAt,
  pilotFrom,
  placedAt,
  onlyCop,
  player,
  rampRoad,
  roadWith,
} from "./race-fixtures.ts";
import { neutralInput, stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type { RaceEvent } from "./state.ts";

describe("road hazards", () => {
  it("a rock spawned in the pilot's lane mid-race is ridden round exactly like one on the track's schedule", () => {
    const scheduled = pilotAt(
      roadWith(placedAt("rock", 1000, 1.8, "drop")),
      800,
      6
    );
    const state = field(hazardFreeRoad, 1, 0, 0);
    const rider = player(state);
    rider.s = 800;
    rider.x = 1.8;
    rider.speed = 170 / KMH;
    const spawned = pilotFrom(state, hazardFreeRoad, 6, (tick) => {
      if (tick === 0) {
        spawnRock(state, hazardFreeRoad, {
          command: "cmd-7",
          id: "drop",
          s: 1000,
          x: 1.8,
        });
      }
    });
    expect(spawned.line).toStrictEqual(scheduled.line);
  });

  it("crashing over a spawned rock names the rock and the command that dropped it", () => {
    const state = field(hazardFreeRoad, 1, 0, 0);
    spawnRock(state, hazardFreeRoad, {
      command: "cmd-8",
      id: "late-drop",
      s: 1000,
      x: 1.8,
    });
    const rider = player(state);
    rider.s = 960;
    rider.x = 1.8;
    rider.speed = 230 / KMH;
    const struck = hold(state, hazardFreeRoad, flatOut, 3).flatMap((event) =>
      event.kind === "crash" ? [event.hazard] : []
    );
    expect(struck).toStrictEqual([
      expect.objectContaining({
        command: "cmd-8",
        id: "late-drop",
        kind: "rock",
      }),
    ]);
  });

  it("a hazard cannot be spawned on a ramp, off the road, or with an id already taken", () => {
    const state = field(rampRoad, 1, 0, 0);
    const spot = { command: null, id: "a", s: 1500, x: 0 };
    expect(spawnPothole(state, rampRoad, spot)?.id).toBe("a");
    expect(spawnPothole(state, rampRoad, { ...spot, s: 1600 })).toBeUndefined();
    expect(
      spawnOil(state, rampRoad, { ...spot, id: "b", s: 1008 })
    ).toBeUndefined();
    expect(
      spawnRock(state, rampRoad, { ...spot, id: "c", x: 4.4 })
    ).toBeUndefined();
    hold(state, rampRoad, neutralInput, 1);
    expect(
      state.hazards
        .filter((hazard) => ["a", "b", "c"].includes(hazard.id))
        .map(({ id, kind, s, x }) => ({ id, kind, s, x }))
    ).toStrictEqual([{ id: "a", kind: "pothole", s: 1500, x: 0 }]);
  });

  it("a cop chasing the player rides round a rock spawned in its path", () => {
    const state = field(hazardFreeRoad, 1, 0, 1);
    const cop = onlyCop(state);
    cop.parked = false;
    cop.s = 700;
    cop.x = 1.8;
    cop.speed = 40;
    const me = player(state);
    me.s = 720;
    me.x = -1.8;
    me.speed = 40;
    spawnRock(state, hazardFreeRoad, {
      command: "cmd-9",
      id: "cop-rock",
      s: 900,
      x: 1.8,
    });
    const inputs = state.riders.map(() => ({ ...neutralInput }));
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
      const copInput = inputs[cop.id];
      if (copInput) {
        pilotInput(state, hazardFreeRoad, cop, copInput);
      }
      inputs[me.id] = { ...neutralInput, throttle: 0.6 };
      stepRace(state, hazardFreeRoad, inputs);
      events.push(...state.events);
    }
    expect(cop.s).toBeGreaterThan(1000);
    expect(
      events.filter((event) => event.kind === "crash" && event.rider === cop.id)
    ).toStrictEqual([]);
  });
});
