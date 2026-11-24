import { trackFor } from "@racer/track/roads";
import type { TrackCrossing } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { onRoad } from "./cross-traffic.ts";
import { frameOf, player } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { crossLightOf, signalPhaseAt } from "./signals.ts";
import type { SignalledCrossing } from "./signals.ts";
import { TICK_RATE } from "./state.ts";
import type { CrossCar, RaceState, TrafficCar } from "./state.ts";

const breakwater = trackFor("breakwater-run");

const harbour = ((): SignalledCrossing => {
  const crossing = breakwater.crossings.find(
    ({ id }) => id === "harbour-cross"
  );
  if (!crossing?.lights) {
    throw new Error("Breakwater Run signals its harbour crossing.");
  }
  return { ...crossing, lights: crossing.lights };
})();

const race = (seed: number): RaceState => {
  const setup = defaultSetup(breakwater, seed);
  return createRace({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
    police: { ...setup.police, count: 0 },
  });
};

// A car that pulls up creeps a few centimetres over its line; a metre over
// it is on its way across.
const PAST_THE_LINE = 1;

const crossingAt = (car: CrossCar): TrackCrossing | undefined =>
  breakwater.crossings[car.junction];

const crossesLane = (car: CrossCar, lane: TrafficCar): boolean => {
  const from = car.fromX + car.across * car.stopAt;
  const to =
    car.fromX +
    car.across *
      (car.turnAt < Number.POSITIVE_INFINITY ? car.turnAt : car.endAt);
  return (
    lane.x > Math.min(from, to) &&
    lane.x < Math.max(from, to) &&
    Math.abs(lane.s - car.s) < lane.halfLength + car.halfLength
  );
};

const overlaps = (car: CrossCar, lane: TrafficCar): boolean =>
  Math.abs(lane.s - car.s) < lane.halfLength + car.halfLength &&
  Math.abs(lane.x - car.x) < lane.halfWidth + car.halfWidth;

describe("cross-road cars and a car stuck in the junction", () => {
  it("hold at their line on their green while a main-road car stands in the box", () => {
    const state = race(7);
    const rider = player(state);
    rider.controller = "human";
    const stuck = state.cars.find((car) => !car.carrier);
    if (!stuck) {
      throw new Error("Breakwater Run has main-road cars.");
    }
    const junction = breakwater.crossings.findIndex(
      ({ id }) => id === harbour.id
    );
    let heldOnGreen = 0;
    let drivenInto = 0;
    for (let tick = 0; tick < 120 * TICK_RATE; tick += 1) {
      stuck.s = harbour.s;
      stuck.speed = 0;
      stepRace(state, breakwater, frameOf(state));
      const green =
        crossLightOf(signalPhaseAt(harbour, state.tick)) === "green";
      for (const car of state.crossCars) {
        if (car.junction !== junction || !onRoad(car)) {
          continue;
        }
        if (green && car.pace < 0.5) {
          heldOnGreen += 1;
        }
        if (overlaps(car, stuck)) {
          drivenInto += 1;
        }
      }
    }
    expect({ drivenInto, held: heldOnGreen > 0 }).toStrictEqual({
      drivenInto: 0,
      held: true,
    });
  });

  it("never leave their line into a box a stopped main-road car still fills, over whole races", () => {
    let intoTakenBox = 0;
    let crossed = 0;
    for (const seed of [1, 2, 3, 4]) {
      const state = race(seed);
      const travelled = new Map<CrossCar, number>();
      for (let tick = 0; tick < 150 * TICK_RATE; tick += 1) {
        stepRace(state, breakwater, frameOf(state));
        for (const car of state.crossCars) {
          const before = travelled.get(car) ?? car.travel;
          travelled.set(car, car.travel);
          const crossing = crossingAt(car);
          if (
            !crossing?.lights ||
            !onRoad(car) ||
            before > car.stopAt + PAST_THE_LINE ||
            car.travel <= car.stopAt + PAST_THE_LINE
          ) {
            continue;
          }
          crossed += 1;
          if (
            state.cars.some(
              (lane) =>
                Math.abs(lane.speed) < 0.5 &&
                Math.abs(lane.s - crossing.s) <
                  lane.halfLength + crossing.boxHalfLength &&
                crossesLane(car, lane)
            )
          ) {
            intoTakenBox += 1;
          }
        }
      }
    }
    expect({ crossed: crossed > 0, intoTakenBox }).toStrictEqual({
      crossed: true,
      intoTakenBox: 0,
    });
  });
});
