import type { TrackCrossing } from "@racer/track/crossings";
import { trackFor } from "@racer/track/roads";
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

const market = ((): SignalledCrossing => {
  const crossing = breakwater.crossings.find(({ id }) => id === "market-cross");
  if (!crossing?.lights) {
    throw new Error("Breakwater Run signals its market crossing.");
  }
  return { ...crossing, lights: crossing.lights };
})();

const greenFrom = (crossing: SignalledCrossing): number => {
  let tick = 0;
  while (crossLightOf(signalPhaseAt(crossing, tick)) !== "green") {
    tick += 1;
  }
  return tick;
};

const race = (seed: number): RaceState => {
  const setup = defaultSetup(breakwater, seed);
  return createRace({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
    police: { ...setup.police, count: 0 },
  });
};

const PAST_THE_LINE = 1;

const crossingAt = (car: CrossCar): TrackCrossing | undefined =>
  breakwater.crossings[car.junction];

const crossesLane = (car: CrossCar, lane: TrafficCar): boolean => {
  const from = car.fromX + car.across * car.stopAt;
  const to =
    car.fromX +
    car.across *
      (car.turnAt < Number.POSITIVE_INFINITY ? car.turnAt : car.endAt);
  const reach = car.bodyHalfLength + lane.halfWidth;
  return (
    lane.x > Math.min(from, to) - reach &&
    lane.x < Math.max(from, to) + reach &&
    Math.abs(lane.s - car.s) < lane.halfLength + car.bodyHalfWidth
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

  it(
    "never leave their line into a box a stopped main-road car still fills, over whole races",
    { timeout: 30_000 },
    () => {
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
    }
  );

  it("hold a long car turning into the inner lane while a car stands in the outer lane its body sweeps", () => {
    const track = { ...breakwater, walkSites: [] };
    const junction = track.crossings.findIndex(({ id }) => id === market.id);
    const setup = defaultSetup(track, 6);
    const state = createRace({
      ...setup,
      police: { ...setup.police, count: 0 },
      rivals: [],
    });
    const [turning] = state.crossCars
      .filter((car) => car.junction === junction && car.along === -1)
      .toSorted((left, right) => right.bodyHalfLength - left.bodyHalfLength);
    const [, outer] = track.oncomingLanes;
    if (!turning || outer === undefined) {
      throw new Error("The market sends cars into two oncoming lanes.");
    }
    for (const car of state.crossCars) {
      car.wait = Number.POSITIVE_INFINITY;
    }
    turning.wait = 0;
    turning.travel = turning.stopAt - 0.1;
    turning.pace = 0;
    turning.x = turning.fromX + turning.across * turning.travel;
    state.tick = greenFrom(market) + 1;
    state.cars.length = 0;
    const stopped: TrafficCar = {
      carrier: false,
      cruiseSpeed: -20,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      home: outer,
      paint: 0,
      patience: 120,
      s: market.s,
      speed: 0,
      waited: 0,
      x: outer,
    };
    state.cars.push(stopped);
    const rider = player(state);
    rider.s = market.s - 7;
    rider.bodyS = rider.s;
    rider.x = outer;
    rider.bodyX = outer;
    let left = 0;
    let drivenInto = 0;
    for (let tick = 0; tick < 400; tick += 1) {
      stepRace(state, track, frameOf(state));
      if (turning.travel > turning.stopAt + PAST_THE_LINE) {
        left += 1;
      }
      if (overlaps(turning, stopped)) {
        drivenInto += 1;
      }
    }
    expect({
      bodyReachesOuterLane:
        turning.bodyHalfLength >
        Math.abs(outer - turning.fromX - turning.across * turning.turnAt) -
          stopped.halfWidth,
      drivenInto,
      left,
    }).toStrictEqual({ bodyReachesOuterLane: true, drivenInto: 0, left: 0 });
  });
});
