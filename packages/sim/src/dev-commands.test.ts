import { describe, expect, it } from "vitest";

import {
  placeRiderAcross,
  placeRiderAt,
  relocateTraffic,
  setRiderSpeed,
} from "./commands.ts";
import {
  field,
  flatOut,
  hazardFreeRoad,
  hold,
  KMH,
  player,
  slowTruckAt,
} from "./race-fixtures.ts";
import { neutralInput, stepRace } from "./race.ts";

describe("dev ride placement", () => {
  it("moving the player along the road carries its body the same distance, and the race rides on from there", () => {
    const state = field(hazardFreeRoad, 1, 0, 0);
    const me = player(state);
    me.bodyS = me.s + 3;
    const { x, speed } = me;
    placeRiderAt(state, 0, 600);
    expect(me.s).toBe(600);
    expect(me.bodyS).toBe(603);
    expect(me.x).toBe(x);
    expect(me.speed).toBe(speed);
    hold(state, hazardFreeRoad, flatOut, 1);
    expect(me.s).toBeGreaterThan(600);
  });

  it("setting the player across the road puts bike and body on that line and leaves its sideways motion alone", () => {
    const state = field(hazardFreeRoad, 1, 0, 0);
    const me = player(state);
    placeRiderAt(state, 0, 600);
    me.lateralSpeed = 0.4;
    placeRiderAcross(state, 0, 1.8);
    expect(me.x).toBe(1.8);
    expect(me.bodyX).toBe(1.8);
    expect(me.lateralSpeed).toBe(0.4);
    expect(me.s).toBe(600);
    stepRace(state, hazardFreeRoad, [neutralInput]);
    expect(me.x).toBeCloseTo(1.8, 1);
  });

  it("setting the player's speed sends it down the road at that speed", () => {
    const state = field(hazardFreeRoad, 1, 0, 0);
    const me = player(state);
    placeRiderAt(state, 0, 600);
    setRiderSpeed(state, 0, 90 / KMH);
    expect(me.speed).toBe(25);
    hold(state, hazardFreeRoad, flatOut, 1);
    expect(me.s - 600).toBeGreaterThan(24);
  });

  it("clearing traffic moves only the cars strictly inside the window, in order, to gaps past it", () => {
    const state = field(hazardFreeRoad, 1, 0, 0);
    for (const s of [440, 441, 1000, 1400, 1399]) {
      slowTruckAt(state, s, 1.8);
    }
    relocateTraffic(state, 500, 1000);
    expect(state.cars.map((car) => car.s)).toStrictEqual([
      440, 1700, 1735, 1400, 1770,
    ]);
    stepRace(state, hazardFreeRoad, [neutralInput]);
    const placed = [440, 1700, 1735, 1400, 1770];
    for (const [index, car] of state.cars.entries()) {
      expect(car.s).toBeGreaterThan(placed[index] ?? 0);
    }
  });

  it("a placement for a rider the race does not have changes nothing", () => {
    const state = field(hazardFreeRoad, 1, 0, 0);
    const before = JSON.stringify(state);
    placeRiderAt(state, 7, 500);
    placeRiderAcross(state, 7, 1);
    setRiderSpeed(state, 7, 30);
    expect(JSON.stringify(state)).toBe(before);
  });
});
