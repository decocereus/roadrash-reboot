import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { frameOf } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { mainLightOf, signalPhaseAt } from "./signals.ts";
import type { SignalledCrossing } from "./signals.ts";
import { TICK_RATE } from "./state.ts";
import type { RaceState, TrafficCar } from "./state.ts";

const course = compileTrack({
  ...roads["breakwater-run"].plan,
  trafficPerKilometre: 0,
});

const harbour = course.crossings.find(({ id }) => id === "harbour-cross");
if (!harbour?.lights) {
  throw new Error("Breakwater Run has a signalled Harbour Cross.");
}
const junction: SignalledCrossing = { ...harbour, lights: harbour.lights };

const carAt = (s: number, x: number, speed: number): TrafficCar => ({
  cruiseSpeed: speed,
  halfLength: 2.2,
  halfWidth: 0.92,
  height: 1.45,
  paint: 1,
  s,
  speed,
  x,
});

const quietRace = (tick: number, cars: readonly TrafficCar[]): RaceState => {
  const setup = defaultSetup(course, 1);
  const state = createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
  state.tick = tick;
  state.cars.push(...cars);
  return state;
};

const ride = (state: RaceState, seconds: number): void => {
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, course, frameOf(state));
  }
};

const firstTick = (from: number, colour: "green" | "red"): number => {
  let tick = from;
  while (mainLightOf(signalPhaseAt(junction, tick)) !== colour) {
    tick += 1;
  }
  return tick;
};

describe("traffic at junction lights", () => {
  it("queues both directions behind their stop lines at a red, nose to tail without touching, and drives on at the green", () => {
    const red = firstTick(0, "red");
    const [sameWay] = course.sameWayLanes;
    const [oncoming] = course.oncomingLanes;
    const queue = [120, 135, 150].map((back) =>
      carAt(junction.s - back, sameWay, 20)
    );
    const facing = [110, 128].map((ahead) =>
      carAt(junction.s + ahead, oncoming, -20)
    );
    const state = quietRace(red, [...queue, ...facing]);

    ride(state, 8);
    const line = junction.s - junction.stopGap;
    const leadFront = (queue[0]?.s ?? 0) + 2.2;
    const facingFront = (facing[0]?.s ?? 0) - 2.2;
    expect({
      apart: queue
        .slice(1)
        .map((car, index) => (queue[index]?.s ?? 0) - car.s - 2 * 2.2 > 1),
      facingBehindItsLine: facingFront > junction.s + junction.stopGap,
      leadJustShort: leadFront < line && leadFront > line - 4,
      light: mainLightOf(signalPhaseAt(junction, state.tick)),
      stopped: state.cars.map((car) => Math.abs(car.speed) < 0.5),
    }).toStrictEqual({
      apart: [true, true],
      facingBehindItsLine: true,
      leadJustShort: true,
      light: "red",
      stopped: [true, true, true, true, true],
    });

    const green = firstTick(state.tick, "green");
    ride(state, (green - state.tick) / TICK_RATE + 12);
    expect(queue.every((car) => car.s > junction.s + 60)).toBeTruthy();
    expect(facing.every((car) => car.s < junction.s - 60)).toBeTruthy();
  });

  it("runs an amber it is too close to stop for rather than stopping in the box", () => {
    const amber = firstTick(0, "red") - 150;
    expect(mainLightOf(signalPhaseAt(junction, amber + 1))).toBe("amber");
    const late = carAt(
      junction.s - junction.stopGap - 15,
      course.sameWayLanes[0],
      25
    );
    const state = quietRace(amber, [late]);

    ride(state, 3);
    expect(late.s).toBeGreaterThan(junction.s + junction.stopGap + 20);
    expect(late.speed).toBeGreaterThan(20);
  });
});
