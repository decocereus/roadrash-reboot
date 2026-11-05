import { clothoids, eased } from "@racer/track/alignment";
import { roadHalfWidthAt } from "@racer/track/districts";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { bikes, streetBike } from "./bikes.ts";
import {
  alone,
  cruising,
  field,
  frameOf,
  hold,
  KMH,
  player,
  quietTrack,
  straight,
} from "./race-fixtures.ts";
import { stepRace } from "./race.ts";
import {
  brakeGrip,
  curvePushOf,
  lateralSpeedLimit,
  PLAYER_RIDER,
  settledLean,
  TICK_RATE,
} from "./state.ts";

const MPH = 2.237;

const arcOf = (curvature: number) =>
  compileTrack({
    ...ridgeRoad,
    carriers: [],
    chevrons: [],
    crowds: [],
    hazardsPerKilometre: 0,
    pieces: clothoids([
      [40, curvature, 0],
      [600, curvature, 0],
      [40, 0, 0],
    ]),
    trafficPerKilometre: 0,
  });

const brakeIntoBend = (brake: number) => {
  const state = field(quietTrack, 1, 0, 0);
  const rider = player(state);
  rider.s = 1520;
  rider.speed = 44;
  const input = {
    brake,
    kick: false,
    punch: false,
    remount: false,
    steer: -1,
    throttle: 0,
  };
  for (let tick = 0; tick < 6 * TICK_RATE && rider.speed > 30; tick += 1) {
    stepRace(state, quietTrack, frameOf(state, [PLAYER_RIDER, input]));
  }
  return { distance: rider.s - 1520, mode: rider.mode };
};

const brakeAcrossBend = (brake: number): number => {
  const state = field(quietTrack, 1, 0, 0);
  const rider = player(state);
  rider.s = 1560;
  rider.x = -4;
  rider.speed = 50;
  hold(
    state,
    quietTrack,
    { brake, kick: false, punch: false, remount: false, steer: 1, throttle: 0 },
    0.4
  );
  return rider.speed;
};

const gainedOn = (course: Track, curvature: number): number => {
  const state = alone(course, streetBike);
  const rider = player(state);
  rider.s = 200;
  rider.speed = 25;
  const push = curvePushOf(streetBike, curvature, rider.speed);
  rider.lateralSpeed = push;
  const steer = curvature === 0 ? 0 : 1;
  hold(state, course, { ...cruising, steer, throttle: 1 }, 0.25);
  return rider.speed - 25;
};

const leanAt = (kmh: number): number => {
  const state = alone(straight, streetBike);
  const rider = player(state);
  rider.speed = kmh / KMH;
  hold(state, straight, { ...cruising, steer: 1, throttle: 0.5 }, 1);
  return rider.lean;
};

describe("riding", () => {
  it("the Sesta reaches 100 km/h in about three and a half seconds and tops out near 240 km/h tucked in", () => {
    const state = field(quietTrack, 1, 0, 0);
    const fullThrottle = {
      brake: 0,
      kick: false,
      punch: false,
      remount: false,
      steer: 0,
      throttle: 1,
    };
    hold(state, quietTrack, fullThrottle, 3);
    expect(player(state).speed * 3.6).toBeLessThan(100);
    hold(state, quietTrack, fullThrottle, 1);
    expect(player(state).speed * 3.6).toBeGreaterThan(100);

    const flat = compileTrack({
      ...ridgeRoad,
      carriers: [],
      chevrons: [],
      crowds: [],
      hazardsPerKilometre: 0,
      pieces: eased([[6000, 0, 0]]),
      trafficPerKilometre: 0,
    });
    const sprint = field(flat, 1, 0, 0);
    hold(sprint, flat, fullThrottle, 60);
    expect(player(sprint).speed * 3.6).toBeGreaterThan(232);
    expect(player(sprint).speed * 3.6).toBeLessThan(246);
  });

  it("the starter bike reaches 100 km/h in under four seconds and tops out between 190 and 202 km/h", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    const fullThrottle = { ...cruising, throttle: 1 };
    hold(state, straight, fullThrottle, 3.2);
    expect(rider.speed * KMH).toBeLessThan(100);
    hold(state, straight, fullThrottle, 0.8);
    expect(rider.speed * KMH).toBeGreaterThan(100);
    expect(rider.speed * MPH).toBeGreaterThan(60);
    hold(state, straight, fullThrottle, 56);
    expect(rider.speed * KMH).toBeGreaterThan(190);
    expect(rider.speed * KMH).toBeLessThan(202);
  });

  it("the starter bike rolls off the throttle: three quarters of its speed is left after three seconds and about half after seven", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    hold(state, straight, { ...cruising, throttle: 1 }, 60);
    const top = rider.speed;
    hold(state, straight, { ...cruising, throttle: 0 }, 3);
    expect(rider.speed).toBeLessThan(top * 0.8);
    expect(rider.speed).toBeGreaterThan(top * 0.68);
    hold(state, straight, { ...cruising, throttle: 0 }, 4);
    expect(rider.speed).toBeLessThan(top * 0.58);
    expect(rider.speed).toBeGreaterThan(top * 0.45);
  });

  it("the brakes take a fifth of a second to bite and then stop the starter bike from top speed in under two and a half seconds and 70 metres", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    hold(state, straight, { ...cruising, throttle: 1 }, 60);
    const top = rider.speed;
    const from = rider.s;
    const braking = { ...cruising, brake: 1, throttle: 0 };
    hold(state, straight, braking, 0.2);
    expect(rider.speed).toBeGreaterThan(top * 0.9);
    hold(state, straight, braking, 2.3);
    expect(rider.speed).toBe(0);
    expect(rider.s - from).toBeLessThan(70);
    expect(rider.s - from).toBeGreaterThan(50);
  });

  it("stops from 200 km/h in about 55 metres", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      carriers: [],
      chevrons: [],
      crowds: [],
      hazardsPerKilometre: 0,
      pieces: eased([[6000, 0, 0]]),
      trafficPerKilometre: 0,
    });
    const state = field(flat, 1, 0, 0);
    const rider = player(state);
    rider.speed = 200 / 3.6;
    const from = rider.s;
    hold(
      state,
      flat,
      {
        brake: 1,
        kick: false,
        punch: false,
        remount: false,
        steer: 0,
        throttle: 0,
      },
      8
    );
    expect(rider.speed).toBe(0);
    expect(rider.s - from).toBeLessThan(65);
    expect(rider.s - from).toBeGreaterThan(45);
  });

  it("the opening bend pushes a rider with centred bars off their line at 144 km/h", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(
      state,
      quietTrack,
      {
        brake: 0,
        kick: false,
        punch: false,
        remount: false,
        steer: 0,
        throttle: 0.6,
      },
      2.5
    );
    expect(rider.x).toBeLessThan(-2);
  });

  it("the opening bend pushes a rider who does not steer to the outside at 190 km/h", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 190 / 3.6;
    hold(
      state,
      quietTrack,
      {
        brake: 0,
        kick: false,
        punch: false,
        remount: false,
        steer: 0,
        throttle: 1,
      },
      2.5
    );
    expect(rider.x).toBeLessThan(-1.5);
  });

  it("slowing down does not take the bend for a rider with centred bars", () => {
    const arc = arcOf(1 / 200);
    const state = alone(arc, streetBike);
    const rider = player(state);
    rider.s = 100;
    rider.x = 0;
    rider.speed = 80 / 3.6;
    hold(state, arc, { ...cruising, steer: 0, throttle: 0.4 }, 4);
    expect(Math.abs(rider.x)).toBeGreaterThan(2);
  });

  it("a curve that reads as straight carries a rider with centred bars at 190 km/h", () => {
    const arc = arcOf(1 / 2000);
    const state = alone(arc, streetBike);
    const rider = player(state);
    rider.s = 100;
    rider.x = 0;
    rider.speed = 190 / 3.6;
    hold(state, arc, { ...cruising, steer: 0, throttle: 1 }, 3);
    expect(Math.abs(rider.x)).toBeLessThan(0.1);
  });

  it.each([
    [1 / 474, -1],
    [1 / 474, 1],
    [-1 / 474, -1],
    [-1 / 474, 1],
  ] as const)(
    "in a bend of curvature %d at 144 km/h, full lock at %d still reaches the bike's whole sideways speed",
    (curvature, steer) => {
      const arc = arcOf(curvature);
      const state = alone(arc, streetBike);
      const rider = player(state);
      rider.s = 200;
      rider.x = -3 * steer;
      rider.speed = 40;
      hold(state, arc, { ...cruising, steer, throttle: 0.6 }, 1.2);
      expect(
        rider.lateralSpeed / lateralSpeedLimit(rider.bike, rider.speed)
      ).toBeCloseTo(steer, 2);
    }
  );

  it("a rider holding a line through a bend leans into it and points along the road", () => {
    const curvature = 1 / 60;
    const arc = arcOf(curvature);
    const state = alone(arc, streetBike);
    const rider = player(state);
    rider.s = 200;
    rider.speed = 20;
    for (let tick = 0; tick < 2 * TICK_RATE; tick += 1) {
      const push = curvePushOf(streetBike, curvature, rider.speed);
      const lean = settledLean(streetBike, curvature, rider.speed);
      const limit = lateralSpeedLimit(streetBike, rider.speed, 0);
      hold(
        state,
        arc,
        {
          ...cruising,
          steer: (push - lean) / (limit - lean),
          throttle: 0,
        },
        1 / TICK_RATE
      );
    }
    expect(Math.abs(rider.lean)).toBeGreaterThan(0.1);
    expect(Math.abs(rider.heading)).toBeLessThan(0.02);
  });

  it("a rider carried wide by a bend while steering into it never points outside the bend", () => {
    const arc = arcOf(1 / 40);
    const state = alone(arc, streetBike);
    const rider = player(state);
    rider.s = 200;
    rider.speed = 30;
    hold(state, arc, { ...cruising, steer: 0.5, throttle: 0.5 }, 0.5);
    expect(rider.lateralSpeed).toBeGreaterThan(0);
    expect(rider.lateralSpeed).toBeLessThan(
      curvePushOf(rider.bike, 1 / 40, rider.speed)
    );
    expect(rider.heading).toBe(0);
  });

  it("a lane change on a straight points the bike where it is going", () => {
    const state = alone(straight, streetBike);
    const rider = player(state);
    rider.speed = 30;
    hold(state, straight, { ...cruising, steer: 1, throttle: 0.5 }, 0.5);
    expect(rider.heading).toBeCloseTo(
      Math.atan(rider.lateralSpeed / rider.speed),
      2
    );
  });

  it("the brakes give up part of their bite to a full-lock turn and keep the rest", () => {
    const lock = lateralSpeedLimit(streetBike, 150 / KMH);
    expect(brakeGrip(streetBike, 0)).toBe(1);
    expect(brakeGrip(streetBike, lock)).toBeLessThan(1);
    expect(brakeGrip(streetBike, lock)).toBeGreaterThan(0.5);
  });

  it("the throttle at the limit of a bend adds less speed than the same throttle on a straight", () => {
    expect(gainedOn(arcOf(1 / 48), 1 / 48)).toBeLessThan(
      gainedOn(straight, 0) * 0.5
    );
  });

  it("a tap off the key in a bend keeps most of the turn", () => {
    const curvature = 1 / 60;
    const arc = arcOf(curvature);
    const state = alone(arc, streetBike);
    const rider = player(state);
    rider.s = 200;
    rider.speed = 20;
    const push = curvePushOf(streetBike, curvature, rider.speed);
    rider.lateralSpeed = push;
    const held = rider.lateralSpeed;
    hold(state, arc, { ...cruising, steer: 0, throttle: 0.4 }, 0.1);
    expect(rider.lateralSpeed).toBeGreaterThan(held * 0.75);
  });

  it("the same lock leans the bike less at a crawl than at speed", () => {
    expect(leanAt(30)).toBeLessThan(leanAt(140) * 0.5);
  });

  it("the bars take most of a second to reach full lock, so a lane change takes over a second", () => {
    const state = alone(straight, streetBike);
    const rider = player(state);
    rider.speed = 40;
    rider.x = 0;
    const steering = { ...cruising, steer: 1, throttle: 0.6 };
    hold(state, straight, steering, 0.25);
    expect(rider.x).toBeLessThan(0.3);
    hold(state, straight, steering, 0.75);
    expect(rider.x).toBeGreaterThan(2);
    expect(rider.x).toBeLessThan(3.2);
  });

  it("the bike carries on sideways for most of a second after the key lifts", () => {
    const flat = straight;
    const state = alone(flat, streetBike);
    const rider = player(state);
    rider.speed = 40;
    rider.x = 0;
    const steering = { ...cruising, steer: 1, throttle: 0.6 };
    hold(state, flat, steering, 1);
    const atRelease = rider.x;
    const released = { ...steering, steer: 0 };
    hold(state, flat, released, 0.5);
    expect(rider.x - atRelease).toBeGreaterThan(1);
    const afterHalfASecond = rider.x;
    hold(state, flat, released, 0.5);
    expect(rider.x - afterHalfASecond).toBeLessThan(0.5);
    expect(rider.x - atRelease).toBeLessThan(2.6);
    const atRest = rider.x;
    hold(state, flat, released, 0.5);
    expect(rider.x - atRest).toBeLessThan(0.01);
  });

  it("the tightest bend cannot be held flat out but can at a sane speed", () => {
    const flatOut = field(quietTrack, 1, 0, 0);
    const fast = player(flatOut);
    fast.s = 1520;
    fast.x = 1.8;
    fast.speed = 58;
    const events = hold(
      flatOut,
      quietTrack,
      {
        brake: 0,
        kick: false,
        punch: false,
        remount: false,
        steer: -1,
        throttle: 1,
      },
      5
    );
    expect(
      fast.offRoad || events.some((event) => event.kind === "crash")
    ).toBeTruthy();

    const sane = field(quietTrack, 1, 0, 0);
    const steady = player(sane);
    steady.s = 1560;
    steady.x = 0;
    steady.speed = 32;
    hold(
      sane,
      quietTrack,
      {
        brake: 0,
        kick: false,
        punch: false,
        remount: false,
        steer: -0.45,
        throttle: 0.3,
      },
      3
    );
    expect(steady.mode).toBe("riding");
    expect(Math.abs(steady.x)).toBeLessThan(roadHalfWidthAt(quietTrack, 0));
  });

  it("the brakes still bite in the tightest bend whichever way the rider steers", () => {
    const braking = brakeIntoBend(1);
    const coasting = brakeIntoBend(0);
    expect([braking.mode, coasting.mode]).toStrictEqual(["riding", "riding"]);
    expect(braking.distance).toBeLessThan(coasting.distance * 0.7);
    expect(brakeAcrossBend(1)).toBeLessThan(brakeAcrossBend(0) - 1.2);
  });

  it("launches over the big crest at speed and lands without crashing", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 53;
    const events = hold(
      state,
      quietTrack,
      {
        brake: 0,
        kick: false,
        punch: false,
        remount: false,
        steer: 0,
        throttle: 1,
      },
      5
    );
    const flights = events.filter(
      (event) => event.kind === "land" && event.airSeconds > 0.5
    );
    expect(flights).toHaveLength(1);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
  });

  it("stays on the ground over the same crest at a cruise", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      {
        brake: 0,
        kick: false,
        punch: false,
        remount: false,
        steer: 0,
        throttle: 0.2,
      },
      5
    );
    expect(events.some((event) => event.kind === "land")).toBeFalsy();
  });
});
