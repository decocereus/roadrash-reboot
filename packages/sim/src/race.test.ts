import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { pilotInput } from "./pilot.ts";
import { createRace, stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type { RaceEvent, RaceState, RiderInput } from "./state.ts";

const track = compileTrack(ridgeRoad);
const quietTrack = compileTrack({ ...ridgeRoad, trafficPerKilometre: 0 });

const player = (state: RaceState) => {
  const [rider] = state.riders;
  if (!rider) {
    throw new Error("The race has no rider.");
  }
  return rider;
};

const hold = (
  state: RaceState,
  course: Track,
  input: RiderInput,
  seconds: number
): RaceEvent[] => {
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, course, [input]);
    events.push(...state.events);
  }
  return events;
};

const pilotUntilFinish = (
  state: RaceState,
  course: Track,
  limitSeconds: number
) => {
  const input: RiderInput = { brake: 0, steer: 0, throttle: 0 };
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < limitSeconds * TICK_RATE; tick += 1) {
    pilotInput(state, course, 0, input);
    stepRace(state, course, [input]);
    events.push(...state.events);
    if (player(state).finishTick >= 0) {
      break;
    }
  }
  return events;
};

describe("riding", () => {
  it("reaches 100 km/h in under five seconds and tops out near 210 km/h", () => {
    const state = createRace(quietTrack, 1);
    const fullThrottle = { brake: 0, steer: 0, throttle: 1 };
    hold(state, quietTrack, fullThrottle, 4.5);
    expect(player(state).speed * 3.6).toBeGreaterThan(100);

    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const sprint = createRace(flat, 1);
    hold(sprint, flat, fullThrottle, 60);
    expect(player(sprint).speed * 3.6).toBeGreaterThan(200);
    expect(player(sprint).speed * 3.6).toBeLessThan(220);
  });

  it("stops from 200 km/h in under 170 metres", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = createRace(flat, 1);
    const rider = player(state);
    rider.speed = 200 / 3.6;
    const from = rider.s;
    hold(state, flat, { brake: 1, steer: 0, throttle: 0 }, 8);
    expect(rider.speed).toBe(0);
    expect(rider.s - from).toBeLessThan(170);
    expect(rider.s - from).toBeGreaterThan(90);
  });

  it("a curve pushes a rider who does not steer to the outside", () => {
    const state = createRace(quietTrack, 1);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(state, quietTrack, { brake: 0, steer: 0, throttle: 0.6 }, 2.5);
    expect(rider.x).toBeLessThan(-1.5);
  });

  it("leaning into the curve holds the lane at a sane speed", () => {
    const state = createRace(quietTrack, 1);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(state, quietTrack, { brake: 0, steer: 0.45, throttle: 0.6 }, 2.5);
    expect(Math.abs(rider.x)).toBeLessThan(3);
    expect(rider.lean).toBeGreaterThan(0.1);
  });

  it("the tightest bend cannot be held flat out", () => {
    const state = createRace(quietTrack, 1);
    const rider = player(state);
    rider.s = 1650;
    rider.x = 1.8;
    rider.speed = 58;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, steer: 1, throttle: 1 },
      6
    );
    const leftTheRoad =
      rider.offRoad || events.some((event) => event.kind === "crash");
    expect(leftTheRoad).toBeTruthy();
  });

  it("launches over the big crest at speed and lands without crashing", () => {
    const state = createRace(quietTrack, 1);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 56;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, steer: 0, throttle: 1 },
      5
    );
    const flights = events.filter(
      (event) => event.kind === "land" && event.airSeconds > 0.5
    );
    expect(flights).toHaveLength(1);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
  });

  it("stays on the ground over the same crest at a cruise", () => {
    const state = createRace(quietTrack, 1);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, steer: 0, throttle: 0.2 },
      5
    );
    expect(events.some((event) => event.kind === "land")).toBeFalsy();
  });
});

describe("crashing", () => {
  it("a head-on hit throws the rider, who runs back and rides again", () => {
    const state = createRace(track, 7);
    const rider = player(state);
    const oncoming = state.cars.find((car) => car.speed < 0 && car.s > 400);
    if (!oncoming) {
      throw new Error("The race has no oncoming traffic.");
    }
    rider.s = oncoming.s - 60;
    rider.x = oncoming.x;
    rider.speed = 35;
    const events = hold(state, track, { brake: 0, steer: 0, throttle: 0 }, 1.5);
    expect(events.map((event) => event.kind)).toContain("crash");
    expect(rider.mode).toBe("thrown");
    expect(rider.bodyS).toBeGreaterThan(rider.s);

    const later = hold(state, track, { brake: 0, steer: 0, throttle: 0 }, 14);
    expect(later.map((event) => event.kind)).toContain("remount");
    expect(rider.mode).toBe("riding");
  });

  it("riding into the trees ends in a crash", () => {
    const state = createRace(quietTrack, 1);
    const rider = player(state);
    rider.s = 100;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, steer: 1, throttle: 1 },
      6
    );
    expect(events.map((event) => event.kind)).toContain("crash");
  });
});

describe("a full race", () => {
  it("the pilot finishes an empty Ridge Road cleanly in a sensible time", () => {
    const state = createRace(quietTrack, 1);
    const events = pilotUntilFinish(state, quietTrack, 240);
    const rider = player(state);
    expect(rider.finishTick).toBeGreaterThan(0);
    expect(rider.crashes).toBe(0);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    const seconds = rider.finishTick / TICK_RATE;
    expect(seconds).toBeGreaterThan(80);
    expect(seconds).toBeLessThan(130);
  });

  it("the pilot gets through traffic and still finishes", () => {
    const state = createRace(track, 11);
    pilotUntilFinish(state, track, 400);
    expect(player(state).finishTick).toBeGreaterThan(0);
  });

  it("replays identically from the same seed and inputs", () => {
    const first = createRace(track, 3);
    const second = createRace(track, 3);
    pilotUntilFinish(first, track, 60);
    pilotUntilFinish(second, track, 60);
    expect(second).toStrictEqual(first);
  });
});
