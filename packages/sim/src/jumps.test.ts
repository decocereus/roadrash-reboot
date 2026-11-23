import { roadHalfWidthAt } from "@racer/track/districts";
import { describe, expect, it } from "vitest";

import {
  field,
  flatOut,
  frameOf,
  hold,
  player,
  quietSlagRow,
  straight,
} from "./race-fixtures.ts";
import { stepRace } from "./race.ts";
import { PLAYER_RIDER, TICK_RATE, lateralSpeedLimit } from "./state.ts";
import type { RaceEvent } from "./state.ts";

const comeDown = (x: number, steering: number) => {
  const state = field(straight, 1, 0, 0);
  const rider = player(state);
  rider.s = 3000;
  rider.x = x;
  rider.speed = 50;
  rider.airborne = true;
  rider.air = 2;
  rider.lateralSpeed = steering * lateralSpeedLimit(rider.bike, 50);
  const events: RaceEvent[] = [];
  let speedBefore = 0;
  let speedAfter = 0;
  for (let tick = 0; tick < 2 * TICK_RATE && rider.airborne; tick += 1) {
    const pace = rider.speed;
    stepRace(
      state,
      straight,
      frameOf(state, [PLAYER_RIDER, { ...flatOut, steer: Math.sign(steering) }])
    );
    events.push(...state.events);
    if (state.events.some((event) => event.kind === "land")) {
      speedBefore = pace;
      speedAfter = rider.speed;
    }
  }
  return {
    crashes: events.filter((event) => event.kind === "crash"),
    flights: events.filter((event) => event.kind === "land"),
    speedAfter,
    speedBefore,
  };
};

const dropOnto = (metres: number): RaceEvent[] => {
  const state = field(straight, 1, 0, 0);
  const rider = player(state);
  rider.s = 3000;
  rider.speed = 40;
  rider.airborne = true;
  rider.air = metres;
  return hold(state, straight, flatOut, 3).filter(
    (event) => event.kind === "crash"
  );
};

const landAt = (impact: number, steering = 0) => {
  const state = field(straight, 1, 0, 0);
  const rider = player(state);
  rider.s = 3000;
  rider.speed = 45;
  rider.airborne = true;
  rider.airTicks = TICK_RATE;
  rider.air = 0.01;
  rider.verticalSpeed = -impact;
  rider.lateralSpeed = steering * lateralSpeedLimit(rider.bike, rider.speed);
  const pace = rider.speed;
  stepRace(
    state,
    straight,
    frameOf(state, [PLAYER_RIDER, { ...flatOut, steer: Math.sign(steering) }])
  );
  const landed = state.events.find((event) => event.kind === "land");
  return {
    crashes: state.events.filter((event) => event.kind === "crash"),
    impact: landed?.kind === "land" ? -landed.impact : Number.NaN,
    kept: rider.speed / pace,
    riding: rider.mode === "riding",
    wobble: rider.wobble,
  };
};

const overSlagRowHump = (speed: number, throttle: number): RaceEvent[] => {
  const state = field(quietSlagRow, 1, 0, 0);
  const rider = player(state);
  rider.s = 3940;
  rider.speed = speed;
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 4 * TICK_RATE && rider.s < 4300; tick += 1) {
    stepRace(
      state,
      quietSlagRow,
      frameOf(state, [PLAYER_RIDER, { ...flatOut, throttle }])
    );
    events.push(...state.events);
  }
  return events;
};

describe("jumping", () => {
  it("a straight landing costs a little speed, not a lot", () => {
    const landing = comeDown(0, 0);
    expect(landing.crashes).toHaveLength(0);
    expect(landing.flights).toHaveLength(1);
    const kept = landing.speedAfter / landing.speedBefore;
    expect(kept).toBeGreaterThan(0.9);
    expect(kept).toBeLessThan(1);
  });

  it("a bike still steering hard when it comes down lands leaned over on the tarmac and crashes; a gentle drift lands", () => {
    const leaned = comeDown(0, 0.75);
    const drifting = comeDown(0, 0.3);
    expect(leaned.crashes.map((crash) => crash.cause)).toStrictEqual([
      "landing",
    ]);
    expect(drifting.crashes).toHaveLength(0);
    expect(drifting.flights).toHaveLength(1);
  });

  it("the same gentle drift at the road edge lands on the verge and crashes", () => {
    const landing = comeDown(roadHalfWidthAt(straight, 0) - 0.5, 0.3);
    expect(landing.crashes.map((crash) => crash.cause)).toStrictEqual([
      "landing",
    ]);
  });

  it("a hard landing up to 19 m/s rides on and pays for it in speed and shake", () => {
    const at = [12, 14, 16].map((impact) => landAt(impact));
    expect(at.map((landing) => landing.crashes.length)).toStrictEqual([
      0, 0, 0,
    ]);
    expect(at.map((landing) => landing.riding)).toStrictEqual([
      true,
      true,
      true,
    ]);
    expect(at.map((landing) => Math.round(landing.impact))).toStrictEqual([
      12, 14, 16,
    ]);
    expect(at.map((landing) => 1 - landing.kept)).toStrictEqual([
      expect.closeTo(0.116, 2),
      expect.closeTo(0.16, 2),
      expect.closeTo(0.2, 2),
    ]);
    expect(at.map((landing) => landing.wobble)).toStrictEqual([
      expect.closeTo(1, 1),
      expect.closeTo(14 / 12, 1),
      expect.closeTo(16 / 12, 1),
    ]);
  });

  it("a landing just under 19 m/s rides on; 19 m/s and harder crashes", () => {
    expect(landAt(18.8).crashes).toHaveLength(0);
    expect(
      landAt(19.2).crashes.map((crash) => crash.kind === "crash" && crash.cause)
    ).toStrictEqual(["landing"]);
  });

  it("a hard landing that also slides across the road still crashes", () => {
    expect(landAt(14, 0).crashes).toHaveLength(0);
    expect(
      landAt(14, 0.75).crashes.map(
        (crash) => crash.kind === "crash" && crash.cause
      )
    ).toStrictEqual(["landing"]);
  });

  it("a bike that drops twenty metres onto the road crashes however straight it lands; a two metre drop is ridden out", () => {
    expect(
      dropOnto(20).map((crash) => crash.kind === "crash" && crash.cause)
    ).toStrictEqual(["landing"]);
    expect(dropOnto(2)).toHaveLength(0);
  });

  it("Slag Row's hump is ridden over on the ground at 130 km/h and gives a short hop flat out", () => {
    const cruise = overSlagRowHump(36, 0.6);
    const flat = overSlagRowHump(53, 1);
    expect(cruise.some((event) => event.kind === "land")).toBeFalsy();
    const hops = flat.filter((event) => event.kind === "land");
    expect(hops).toHaveLength(1);
    expect(hops[0]?.kind === "land" && hops[0].airSeconds).toBeGreaterThan(0.1);
    expect(hops[0]?.kind === "land" && hops[0].airSeconds).toBeLessThan(1);
    expect(flat.some((event) => event.kind === "crash")).toBeFalsy();
  });
});
