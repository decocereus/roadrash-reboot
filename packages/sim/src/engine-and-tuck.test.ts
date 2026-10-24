import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { topSpeedOf } from "./engine.ts";
import {
  alone,
  cruising,
  frameOf,
  hold,
  KMH,
  player,
  straight,
} from "./race-fixtures.ts";
import { stepRace } from "./race.ts";
import { PLAYER_RIDER, TICK_RATE } from "./state.ts";
import type { BikeSpec } from "./state.ts";

const gearTrace = (bike: BikeSpec, seconds: number) => {
  const state = alone(straight, bike);
  const rider = player(state);
  const trace: { gear: number; revs: number; speed: number }[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(
      state,
      straight,
      frameOf(state, [PLAYER_RIDER, { ...cruising, throttle: 1 }])
    );
    trace.push({ gear: rider.gear, revs: rider.revs, speed: rider.speed });
  }
  return trace;
};

const pullAt = (
  trace: readonly { gear: number; revs: number; speed: number }[],
  gear: number,
  revs: number
): number => {
  const index = trace.findIndex(
    (step) => step.gear === gear && step.revs >= revs
  );
  const before = trace[index - 1];
  const after = trace[index + 1];
  if (!(before && after)) {
    throw new Error(
      `The bike never reached ${revs} of the redline in gear ${gear}.`
    );
  }
  return ((after.speed - before.speed) * TICK_RATE) / 2;
};

describe("gears and the tuck", () => {
  it("the starter bike climbs through all six gears on a straight, and every upshift is a short lull before it pulls again", () => {
    const trace = gearTrace(bikes["halden-wren-400"], 25);
    const shifts = trace
      .map((step, tick) => ({ step, tick }))
      .filter(
        ({ step, tick }) => tick > 0 && step.gear !== trace[tick - 1]?.gear
      );
    expect(shifts.map(({ step }) => step.gear)).toStrictEqual([2, 3, 4, 5, 6]);
    for (const { tick } of shifts) {
      const atShift = trace[tick];
      const beforeShift = trace[tick - 1];
      const afterCut = trace[tick + 8];
      const pullingAgain = trace[tick + 30];
      if (!(atShift && beforeShift && afterCut && pullingAgain)) {
        throw new Error("The trace is too short.");
      }
      expect(atShift.revs).toBeLessThan(beforeShift.revs - 0.08);
      expect(afterCut.speed).toBeLessThan(atShift.speed + 0.05);
      expect(pullingAgain.speed).toBeGreaterThan(afterCut.speed + 0.5);
    }
    expect((trace.at(-1)?.speed ?? 0) * KMH).toBeGreaterThan(185);
  });

  it("in a gear the bike pulls hardest in the middle of the rev range and tails off toward the redline", () => {
    const trace = gearTrace(bikes["halden-wren-400"], 25);
    const inTheBand = pullAt(trace, 2, 0.8);
    const atTheRedline = pullAt(trace, 2, 0.95);
    expect(inTheBand).toBeGreaterThan(atTheRedline * 1.1);
    expect(pullAt(trace, 3, 0.8)).toBeGreaterThan(pullAt(trace, 3, 0.95) * 1.1);
  });

  it("a rider who holds the throttle and sits still tucks in at speed and tops out about four per cent faster than one who keeps swinging", () => {
    const bike = bikes["halden-wren-400"];
    const still = alone(straight, bike);
    const swinging = alone(straight, bike);
    hold(still, straight, { ...cruising, throttle: 1 }, 60);
    hold(swinging, straight, { ...cruising, punch: true, throttle: 1 }, 60);
    expect(player(still).tuck).toBe(1);
    expect(player(swinging).tuck).toBe(0);
    expect(player(still).speed).toBeCloseTo(topSpeedOf(bike, true), 0);
    expect(player(swinging).speed).toBeCloseTo(topSpeedOf(bike), 0);
    const gain = player(still).speed / player(swinging).speed;
    expect(gain > 1.03 && gain < 1.06).toBeTruthy();
  });

  it("the rider sits up for the first seconds off the line and tucks in only after a second and a half above 120 km/h, easing in over a second", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    const fullThrottle = { ...cruising, throttle: 1 };
    hold(state, straight, fullThrottle, 3);
    const atThreeSeconds = { speed: rider.speed * KMH, tuck: rider.tuck };
    let tuckedEarly = false;
    while (rider.speed * KMH <= 120) {
      stepRace(state, straight, frameOf(state, [PLAYER_RIDER, fullThrottle]));
      tuckedEarly ||= rider.tuck > 0;
    }
    hold(state, straight, fullThrottle, 1.4);
    const settling = rider.tuck;
    hold(state, straight, fullThrottle, 0.2);
    const easingIn = rider.tuck;
    hold(state, straight, fullThrottle, 1);
    expect(atThreeSeconds.speed).toBeLessThan(120);
    expect({
      settling,
      tuckAtThree: atThreeSeconds.tuck,
      tuckedEarly,
    }).toStrictEqual({
      settling: 0,
      tuckAtThree: 0,
      tuckedEarly: false,
    });
    expect(easingIn).toBeGreaterThan(0);
    expect(easingIn).toBeLessThan(0.2);
    expect(rider.tuck).toBe(1);
  });

  it("a tucked rider who steers stays tucked, a quarter of the way up at full lock, and comes back down when the bars straighten", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    hold(state, straight, { ...cruising, throttle: 1 }, 20);
    const onTheStraight = rider.tuck;
    rider.x = -3;
    hold(state, straight, { ...cruising, steer: 1, throttle: 1 }, 1);
    const atFullLock = { speed: rider.speed * KMH, tuck: rider.tuck };
    hold(state, straight, { ...cruising, steer: -1, throttle: 1 }, 0.4);
    const flicked = rider.tuck;
    hold(state, straight, { ...cruising, throttle: 1 }, 1.5);
    expect({ onTheStraight, straightAgain: rider.tuck }).toStrictEqual({
      onTheStraight: 1,
      straightAgain: 1,
    });
    expect(atFullLock.tuck).toBeGreaterThan(0.7);
    expect(atFullLock.tuck).toBeLessThan(0.8);
    expect(atFullLock.speed).toBeGreaterThan(150);
    expect(flicked).toBeGreaterThan(0.7);
  });

  it("a hard brake sits the rider up within a third of a second, and the tuck needs a fresh second and a half at speed before it eases back in", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    hold(state, straight, { ...cruising, throttle: 1 }, 20);
    const onTheStraight = rider.tuck;
    hold(state, straight, { ...cruising, brake: 1, throttle: 0 }, 0.3);
    const braked = { speed: rider.speed * KMH, tuck: rider.tuck };
    hold(state, straight, { ...cruising, throttle: 1 }, 1.4);
    const settling = rider.tuck;
    hold(state, straight, { ...cruising, throttle: 1 }, 0.6);
    const halfway = rider.tuck;
    hold(state, straight, { ...cruising, throttle: 1 }, 0.6);
    expect({ onTheStraight, settling, tuckedAgain: rider.tuck }).toStrictEqual({
      onTheStraight: 1,
      settling: 0,
      tuckedAgain: 1,
    });
    expect(braked.tuck).toBeLessThan(0.05);
    expect(braked.speed).toBeGreaterThan(120);
    expect(halfway).toBeGreaterThan(0.4);
    expect(halfway).toBeLessThan(0.6);
  });
});
