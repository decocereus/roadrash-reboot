import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { pilotInput } from "./pilot.ts";
import { createRace, standings, stepRace } from "./race.ts";
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
  const input: RiderInput = {
    brake: 0,
    kick: false,
    punch: false,
    steer: 0,
    throttle: 0,
  };
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
    const state = createRace(quietTrack, 1, 0);
    const fullThrottle = {
      brake: 0,
      kick: false,
      punch: false,
      steer: 0,
      throttle: 1,
    };
    hold(state, quietTrack, fullThrottle, 4.5);
    expect(player(state).speed * 3.6).toBeGreaterThan(100);

    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const sprint = createRace(flat, 1, 0);
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
    const state = createRace(flat, 1, 0);
    const rider = player(state);
    rider.speed = 200 / 3.6;
    const from = rider.s;
    hold(
      state,
      flat,
      { brake: 1, kick: false, punch: false, steer: 0, throttle: 0 },
      8
    );
    expect(rider.speed).toBe(0);
    expect(rider.s - from).toBeLessThan(170);
    expect(rider.s - from).toBeGreaterThan(90);
  });

  it("a curve pushes a rider who does not steer to the outside", () => {
    const state = createRace(quietTrack, 1, 0);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0.6 },
      2.5
    );
    expect(rider.x).toBeLessThan(-1.5);
  });

  it("a light steer into the curve holds the lane at a sane speed", () => {
    const state = createRace(quietTrack, 1, 0);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0.2, throttle: 0.6 },
      2.5
    );
    expect(Math.abs(rider.x)).toBeLessThan(1.5);
  });

  it("a lane change takes about half a second and stops when the key lifts", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = createRace(flat, 1, 0);
    const rider = player(state);
    rider.speed = 40;
    rider.x = 0;
    hold(
      state,
      flat,
      { brake: 0, kick: false, punch: false, steer: 1, throttle: 0.6 },
      0.5
    );
    const atRelease = rider.x;
    expect(atRelease).toBeGreaterThan(3);
    expect(atRelease).toBeLessThan(5.2);
    hold(
      state,
      flat,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0.6 },
      1
    );
    expect(rider.x - atRelease).toBeLessThan(0.9);
  });

  it("the tightest bend cannot be held flat out but can at a sane speed", () => {
    const flatOut = createRace(quietTrack, 1, 0);
    const fast = player(flatOut);
    fast.s = 1520;
    fast.x = 1.8;
    fast.speed = 58;
    const events = hold(
      flatOut,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: -1, throttle: 1 },
      5
    );
    expect(
      fast.offRoad || events.some((event) => event.kind === "crash")
    ).toBeTruthy();

    const sane = createRace(quietTrack, 1, 0);
    const steady = player(sane);
    steady.s = 1560;
    steady.x = 0;
    steady.speed = 36;
    hold(
      sane,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: -0.45, throttle: 0.4 },
      3
    );
    expect(steady.mode).toBe("riding");
    expect(Math.abs(steady.x)).toBeLessThan(quietTrack.roadHalfWidth);
  });

  it("launches over the big crest at speed and lands without crashing", () => {
    const state = createRace(quietTrack, 1, 0);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 56;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 1 },
      5
    );
    const flights = events.filter(
      (event) => event.kind === "land" && event.airSeconds > 0.5
    );
    expect(flights).toHaveLength(1);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
  });

  it("stays on the ground over the same crest at a cruise", () => {
    const state = createRace(quietTrack, 1, 0);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0.2 },
      5
    );
    expect(events.some((event) => event.kind === "land")).toBeFalsy();
  });
});

describe("crashing", () => {
  it("a head-on hit throws the rider, who runs back and rides again", () => {
    const state = createRace(track, 7, 0);
    const rider = player(state);
    const oncoming = state.cars.find((car) => car.speed < 0 && car.s > 400);
    if (!oncoming) {
      throw new Error("The race has no oncoming traffic.");
    }
    rider.s = oncoming.s - 60;
    rider.x = oncoming.x;
    rider.speed = 35;
    const events = hold(
      state,
      track,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0 },
      1.5
    );
    expect(events.map((event) => event.kind)).toContain("crash");
    expect(rider.mode).toBe("thrown");
    expect(rider.bodyS).toBeGreaterThan(rider.s);

    const later = hold(
      state,
      track,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0 },
      14
    );
    expect(later.map((event) => event.kind)).toContain("remount");
    expect(rider.mode).toBe("riding");
  });

  it("riding into the trees ends in a crash", () => {
    const state = createRace(quietTrack, 1, 0);
    const rider = player(state);
    rider.s = 100;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 1, throttle: 1 },
      6
    );
    expect(events.map((event) => event.kind)).toContain("crash");
  });
});

describe("a full race", () => {
  it("the pilot finishes an empty Ridge Road cleanly in a sensible time", () => {
    const state = createRace(quietTrack, 1, 0);
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
    const state = createRace(track, 11, 0);
    pilotUntilFinish(state, track, 400);
    expect(player(state).finishTick).toBeGreaterThan(0);
  });

  it("replays identically from the same seed and inputs", () => {
    const first = createRace(track, 3, 0);
    const second = createRace(track, 3, 0);
    pilotUntilFinish(first, track, 60);
    pilotUntilFinish(second, track, 60);
    expect(second).toStrictEqual(first);
  });
});

describe("the pack", () => {
  it("a punch drains stamina and enough of them knock the rival down", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = createRace(flat, 1, 1);
    const [me, rival] = state.riders;
    if (!(me && rival)) {
      throw new Error("The race needs a rival.");
    }
    rival.s = 50;
    rival.x = 1.8;
    rival.speed = 30;
    me.s = 50;
    me.x = 0.3;
    me.speed = 30;
    const idle = {
      brake: 0,
      kick: false,
      punch: false,
      steer: 0,
      throttle: 0.5,
    };
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 8 * TICK_RATE; tick += 1) {
      const punching = { ...idle, punch: tick % 20 === 0 };
      stepRace(state, flat, [punching, idle]);
      events.push(...state.events);
      me.x = 0.3;
      me.s = rival.s;
      if (rival.mode !== "riding") {
        break;
      }
    }
    const hits = events.filter((event) => event.kind === "hit");
    expect(hits.length).toBeGreaterThan(3);
    expect(rival.mode).toBe("thrown");
    expect(
      events.some((event) => event.kind === "crash" && event.cause === "combat")
    ).toBeTruthy();
  });

  it("six riders all finish Ridge Road and the standings are ordered", () => {
    const state = createRace(track, 4);
    const inputs = state.riders.map(() => ({
      brake: 0,
      kick: false,
      punch: false,
      steer: 0,
      throttle: 0,
    }));
    for (let tick = 0; tick < 300 * TICK_RATE; tick += 1) {
      for (const [index, input] of inputs.entries()) {
        pilotInput(state, track, index, input);
      }
      stepRace(state, track, inputs);
      if (state.riders.every((rider) => rider.finishTick >= 0)) {
        break;
      }
    }
    expect(state.riders.every((rider) => rider.finishTick >= 0)).toBeTruthy();
    const order = standings(state);
    expect(order).toHaveLength(6);
    for (let place = 1; place < order.length; place += 1) {
      const ahead = state.riders[order[place - 1] ?? 0];
      const behind = state.riders[order[place] ?? 0];
      expect(
        (ahead?.finishTick ?? 0) <= (behind?.finishTick ?? 0)
      ).toBeTruthy();
    }
  });
});
