import { describe, expect, it } from "vitest";

import {
  field,
  frameOf,
  player,
  quietTrack,
  rivalNamed,
  track,
} from "./race-fixtures.ts";
import { neutralInput, stepRace } from "./race.ts";
import { throwRider } from "./rider-crash.ts";
import { PLAYER_RIDER, TICK_RATE } from "./state.ts";
import type { RaceState, RiderState, TrafficCar } from "./state.ts";

const downInLane = () => {
  const state = field(quietTrack, 1, 0, 0);
  const rider = player(state);
  state.cars.length = 0;
  rider.s = 400;
  rider.x = -1.8;
  rider.speed = 0;
  rider.stamina = 0;
  stepRace(state, quietTrack, frameOf(state, [PLAYER_RIDER, neutralInput]));
  expect(rider.mode).toBe("thrown");
  rider.bodyS = 400;
  rider.bodyX = 6;
  rider.bodySpeed = 0;
  rider.bodyLateralSpeed = 0;
  return { rider, state };
};

const carBehind = (s: number, x: number, patience: number): TrafficCar => ({
  carrier: false,
  cruiseSpeed: 20,
  halfLength: 2.2,
  halfWidth: 0.92,
  height: 1.45,
  home: x,
  paint: 0,
  patience,
  s,
  speed: 20,
  waited: 0,
  x,
});

const untilBikeKnocked = (
  state: RaceState,
  rider: RiderState,
  car: TrafficCar
) => {
  let stoppedFor = 0;
  let ticks = 0;
  const startedCondition = rider.condition;
  while (rider.condition === startedCondition && ticks < 30 * TICK_RATE) {
    stepRace(state, quietTrack, frameOf(state, [PLAYER_RIDER, neutralInput]));
    stoppedFor += car.speed < 1 ? 1 : 0;
    ticks += 1;
  }
  return { stoppedFor, ticks };
};

const patienceIn = (seed: number) =>
  field(track, seed, 0, 0).cars.map((car) => car.patience);

const knockedFrom = (offset: number) => {
  const { rider, state } = downInLane();
  const car = carBehind(380, rider.x + offset, 0);
  state.cars.push(car);
  untilBikeKnocked(state, rider, car);
  return { across: rider.lateralSpeed, forward: rider.speed };
};

const lieDownAt = (rider: RiderState, s: number, bodyS: number) => {
  rider.mode = "lying";
  rider.modeTicks = -100_000;
  rider.controller = "pilot";
  rider.s = s;
  rider.x = -1.8;
  rider.speed = 0;
  rider.bodyS = bodyS;
  rider.bodyX = 6;
};

describe("cars and a bike down in their lane", () => {
  it("a car stops short of the bike, waits out its own patience, and then drives over it", () => {
    const { rider, state } = downInLane();
    const car = carBehind(300, rider.x, 120);
    state.cars.push(car);
    const { stoppedFor } = untilBikeKnocked(state, rider, car);
    expect(rider.condition).toBeLessThan(100);
    expect(stoppedFor).toBeGreaterThanOrEqual(110);
    expect(stoppedFor).toBeLessThan(170);
  });

  it("a car that has driven over one bike waits again for the next, even with the first rider's body off to the side between them", () => {
    const state = field(quietTrack, 1, 1, 0);
    const first = player(state);
    const second = rivalNamed(state, "dee-santangelo");
    state.cars.length = 0;
    lieDownAt(first, 400, 415);
    lieDownAt(second, 430, 445);
    const car = carBehind(320, -1.8, 60);
    state.cars.push(car);
    let stoppedAfterFirst = 0;
    while (second.condition === 100 && state.tick < 40 * TICK_RATE) {
      stepRace(state, quietTrack, frameOf(state));
      if (first.condition < 100 && car.speed < 1) {
        stoppedAfterFirst += 1;
      }
    }
    expect(first.condition).toBeLessThan(100);
    expect(second.condition).toBeLessThan(100);
    expect(stoppedAfterFirst).toBeGreaterThanOrEqual(55);
  });

  it("every car's patience is between a second and a half and three seconds, varies, and comes from the race's seed", () => {
    const first = patienceIn(7);
    expect(first).toStrictEqual(patienceIn(7));
    expect(first).not.toStrictEqual(patienceIn(8));
    expect(new Set(first).size).toBeGreaterThan(10);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(90);
    expect(Math.max(...first)).toBeLessThanOrEqual(180);
  });

  it("a hit on the bike's left side knocks it right, a hit on its right side knocks it left, and a square hit shoves it up the road", () => {
    const carOnLeft = knockedFrom(-1);
    const carOnRight = knockedFrom(1);
    const square = knockedFrom(0);
    expect(carOnLeft.across).toBeGreaterThan(1);
    expect(carOnRight.across).toBeLessThan(-1);
    expect(square.across).toBe(0);
    expect(square.forward).toBeGreaterThan(carOnLeft.forward);
    expect(square.forward).toBeGreaterThan(1);
  });

  it("the knock moves a bike whose rider is already on their feet, and the rider runs to where it ended up", () => {
    const { rider, state } = downInLane();
    rider.mode = "running";
    rider.modeTicks = 100;
    const car = carBehind(380, rider.x, 0);
    state.cars.push(car);
    untilBikeKnocked(state, rider, car);
    for (let tick = 0; tick < 2 * TICK_RATE; tick += 1) {
      stepRace(state, quietTrack, frameOf(state, [PLAYER_RIDER, neutralInput]));
    }
    expect(rider.s).toBeGreaterThan(400.5);
    expect(rider.mode).toBe("running");
  });

  it("run-overs bring a bike very low but never total it, and the next crash finishes it", () => {
    const { rider, state } = downInLane();
    rider.condition = 30;
    const car = carBehind(380, rider.x, 0);
    state.cars.push(car);
    untilBikeKnocked(state, rider, car);
    expect(rider.condition).toBe(1);
    expect(rider.mode).not.toBe("wrecked");
    rider.mode = "riding";
    rider.stamina = 100;
    rider.speed = 20;
    throwRider(state, rider, "offTrack", 0.3, 0.5);
    expect(rider.condition).toBe(0);
    expect(rider.mode).toBe("wrecked");
  });

  it("one car knocks and damages the bike once, however long it takes to pass", () => {
    const { rider, state } = downInLane();
    const car = carBehind(380, rider.x, 0);
    state.cars.push(car);
    untilBikeKnocked(state, rider, car);
    const once = rider.condition;
    for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
      stepRace(state, quietTrack, frameOf(state, [PLAYER_RIDER, neutralInput]));
    }
    expect(rider.condition).toBe(once);
  });

  it("a police bike takes no damage from a run-over", () => {
    const state = field(quietTrack, 1, 0, 1);
    const cop = state.riders.find((each) => each.profile.role === "police");
    if (!cop) {
      throw new Error("The race has no cop.");
    }
    cop.mode = "lying";
    cop.modeTicks = 0;
    cop.controller = "pilot";
    cop.s = 500;
    cop.x = -1.8;
    cop.bodyS = 500;
    cop.bodyX = 6;
    state.cars.length = 0;
    state.cars.push(carBehind(498, cop.x, 0));
    const before = cop.condition;
    stepRace(state, quietTrack, frameOf(state, [PLAYER_RIDER, neutralInput]));
    expect(cop.speed).toBeGreaterThan(0);
    expect(cop.condition).toBe(before);
  });
});
