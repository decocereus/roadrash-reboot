import { eased } from "@racer/track/alignment";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { pilotInput } from "./pilot.ts";
import { player, rivalNamed } from "./race-fixtures.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type { RaceEvent, RaceState, RiderInput, TrafficCar } from "./state.ts";

const wide = compileTrack({ ...ridgeRoad, lanesEachWay: 2 });
const straightOf = (lanesEachWay: 1 | 2): Track =>
  compileTrack({
    ...ridgeRoad,
    features: [],
    lanesEachWay,
    pieces: eased([[6000, 0, 0]]),
    trafficPerKilometre: 0,
  });
const wideStraight = straightOf(2);
const narrowStraight = straightOf(1);

const cruising: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0.5,
};

const field = (course: Track, seed: number, rivalCount: number): RaceState => {
  const setup = defaultSetup(course, seed);
  return createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: setup.rivals.slice(0, rivalCount),
  });
};

const slowCar = (s: number, x: number): TrafficCar => ({
  cruiseSpeed: 15,
  halfLength: 2.2,
  halfWidth: 0.92,
  height: 1.45,
  paint: 1,
  s,
  speed: 15,
  x,
});

const lanesUsed = (cars: readonly TrafficCar[]): number[] =>
  [...new Set(cars.map((car) => car.x))].toSorted(
    (left, right) => left - right
  );

const meanCruise = (cars: readonly TrafficCar[], x: number): number => {
  const inLane = cars.filter((car) => car.x === x);
  return (
    inLane.reduce((sum, car) => sum + Math.abs(car.cruiseSpeed), 0) /
    inLane.length
  );
};

const rivalPasses = (course: Track, blockers: readonly TrafficCar[]) => {
  const state = field(course, 1, 1);
  const rival = rivalNamed(state, "dee-santangelo");
  rival.s = 100;
  rival.x = 1.8;
  rival.speed = 30;
  state.cars.push(...blockers);
  const input: RiderInput = { ...neutralInput };
  const events: RaceEvent[] = [];
  let leftmost = rival.x;
  let rightmost = rival.x;
  for (let tick = 0; tick < 8 * TICK_RATE; tick += 1) {
    pilotInput(state, course, rival, input);
    stepRace(state, course, [neutralInput, input]);
    events.push(...state.events.filter((event) => event.rider === rival.id));
    leftmost = Math.min(leftmost, rival.x);
    rightmost = Math.max(rightmost, rival.x);
  }
  const furthestBlocker = Math.max(...blockers.map((car) => car.s));
  return {
    crashed: events.some((event) => event.kind === "crash"),
    leftmost,
    passed: rival.s > furthestBlocker + 10,
    rightmost,
  };
};

const onRoadAt = (course: Track, x: number) => {
  const state = field(course, 1, 0);
  const me = player(state);
  me.s = 100;
  me.x = x;
  me.speed = 40;
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    stepRace(state, course, [cruising]);
  }
  return { onRoad: !me.offRoad, speed: me.speed };
};

describe("a road with two lanes each way", () => {
  it("traffic drives in both same-way lanes and both oncoming lanes, and the slow cars keep to the outside", () => {
    const state = field(wide, 7, 0);
    expect(lanesUsed(state.cars)).toStrictEqual([-5.4, -1.8, 1.8, 5.4]);
    expect(meanCruise(state.cars, 5.4)).toBeLessThan(
      meanCruise(state.cars, 1.8)
    );
    expect(meanCruise(state.cars, -5.4)).toBeLessThan(
      meanCruise(state.cars, -1.8)
    );
    for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
      stepRace(state, wide, [neutralInput]);
    }
    const moving = state.cars.filter((car) => car.speed !== 0);
    expect(moving.length).toBeGreaterThan(state.cars.length / 2);
    expect(
      moving.every((car) => Math.sign(car.speed) === Math.sign(car.x))
    ).toBeTruthy();
  });

  it("the tarmac reaches twice as far, so a rider 6.5 m out is still on the road", () => {
    const narrowRun = onRoadAt(narrowStraight, 6.5);
    const wideRun = onRoadAt(wideStraight, 6.5);
    expect(narrowRun.onRoad).toBeFalsy();
    expect(wideRun.onRoad).toBeTruthy();
    expect(wideRun.speed).toBeGreaterThan(narrowRun.speed);
    expect(onRoadAt(wideStraight, 9).onRoad).toBeFalsy();
  });

  it("a rival behind a slow car passes it in the other same-way lane, not against the traffic", () => {
    const pass = rivalPasses(wideStraight, [slowCar(140, 1.8)]);
    expect(pass.crashed).toBeFalsy();
    expect(pass.passed).toBeTruthy();
    expect(pass.leftmost).toBeGreaterThan(0);
    expect(pass.rightmost).toBeGreaterThan(4);
  });

  it("a rival with both same-way lanes blocked passes in the oncoming lane", () => {
    const pass = rivalPasses(wideStraight, [
      slowCar(140, 1.8),
      slowCar(140, 5.4),
    ]);
    expect(pass.crashed).toBeFalsy();
    expect(pass.passed).toBeTruthy();
    expect(pass.leftmost).toBeLessThan(-1);
  });

  it("the grid fills every lane of the road with the player at the back", () => {
    const state = createRace(defaultSetup(wide, 1));
    const racers = state.riders.filter(
      (rider) => rider.profile.role === "racer"
    );
    expect(lanesUsed(racers.map((rider) => slowCar(0, rider.x)))).toStrictEqual(
      [-5.4, -1.8, 1.8, 5.4]
    );
    const me = player(state);
    expect(me.x).toBe(1.8);
    expect(
      racers.every((rider) => rider === me || rider.s > me.s)
    ).toBeTruthy();
  });
});
