import { trackFor } from "@racer/track/roads";
import type { StallFootprint } from "@racer/track/stalls";
import { describe, expect, it } from "vitest";

import { field, flatOut, frameOf, pilotFrom, player } from "./race-fixtures.ts";
import { neutralInput, stepRace } from "./race.ts";
import { trackDigest } from "./snapshot-setup.ts";
import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  PLAYER_RIDER,
  TICK_RATE,
  WALKING_PACE,
} from "./state.ts";
import type { RaceEvent, RiderInput } from "./state.ts";

const road = trackFor("breakwater-run");
const HALF_WIDTH_OF_STRIP = 1;

const stallOn = (side: number, place: number): StallFootprint => {
  const stall = road.stalls.filter(({ x }) => Math.sign(x) === side)[place];
  if (!stall) {
    throw new Error(`The market has no stall ${place} on side ${side}.`);
  }
  return stall;
};

const inside = (stall: StallFootprint, s: number, x: number) =>
  Math.abs(s - stall.s) < stall.halfLength + BIKE_HALF_LENGTH &&
  Math.abs(x - stall.x) < stall.halfWidth + BIKE_HALF_WIDTH;

const ride = (
  from: { readonly s: number; readonly speed: number; readonly x: number },
  input: RiderInput,
  seconds: number
) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = from.s;
  rider.x = from.x;
  rider.speed = from.speed;
  const events: RaceEvent[] = [];
  let slowest = rider.speed;
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, road, frameOf(state, [PLAYER_RIDER, input]));
    events.push(...state.events);
    slowest = Math.min(slowest, rider.speed);
  }
  return { events, rider, slowest };
};

const crashes = (events: readonly RaceEvent[]) =>
  events.flatMap((event) => (event.kind === "crash" ? [event] : []));

const bumps = (events: readonly RaceEvent[]) =>
  events.filter((event) => event.kind === "bump");

const headOn = (stall: StallFootprint, speed: number) => ({
  s: stall.s - stall.halfLength - BIKE_HALF_LENGTH - 0.3,
  speed,
  x: stall.x,
});

const besideOnStrip = (stall: StallFootprint, speed: number) => ({
  s: stall.s - stall.halfLength,
  speed,
  x:
    Math.sign(stall.x) *
    (Math.abs(stall.x) - stall.halfWidth - HALF_WIDTH_OF_STRIP),
});

const coast: RiderInput = { ...neutralInput, throttle: 0 };

describe("a stall in the rider's way", () => {
  it("crashes a fast rider who hits it, as a solid prop", () => {
    const { events, rider } = ride(headOn(stallOn(1, 10), 30), coast, 0.4);
    expect(crashes(events).map(({ cause }) => cause)).toStrictEqual(["prop"]);
    expect(rider.mode).toBe("thrown");
    expect(rider.condition).toBeLessThan(100);
  });

  it("crashes a fast rider running wide across the strip into it", () => {
    const stall = stallOn(-1, 10);
    const { events } = ride(
      besideOnStrip(stall, 30),
      { ...flatOut, steer: -1 },
      0.5
    );
    expect(crashes(events).map(({ cause }) => cause)).toStrictEqual(["prop"]);
  });

  it("stops a slow rider who touches it, without a crash, and turns them toward the road", () => {
    const stall = stallOn(1, 10);
    const { events, rider, slowest } = ride(
      besideOnStrip(stall, 10),
      { ...coast, steer: 1 },
      0.7
    );
    expect(crashes(events)).toStrictEqual([]);
    expect(bumps(events)).toHaveLength(1);
    expect(slowest).toBeLessThanOrEqual(WALKING_PACE);
    expect(rider.mode).toBe("riding");
    expect(Math.abs(rider.x)).toBeLessThan(Math.abs(stall.x) - stall.halfWidth);
  });

  it("grades the same stall by the speed that reached it, 14 m/s and under being a touch", () => {
    const stall = stallOn(1, 20);
    expect(crashes(ride(headOn(stall, 13.9), coast, 0.3).events)).toStrictEqual(
      []
    );
    expect(
      crashes(ride(headOn(stall, 14.5), coast, 0.3).events).map(
        ({ cause }) => cause
      )
    ).toStrictEqual(["prop"]);
  });

  it("lets a rider who touched it ride off along the strip", () => {
    const stall = stallOn(-1, 15);
    const state = field(road, 1, 0, 0);
    const rider = player(state);
    Object.assign(rider, besideOnStrip(stall, 10));
    for (let tick = 0; tick < 3 * TICK_RATE; tick += 1) {
      const steer = tick < TICK_RATE ? -1 : 1;
      stepRace(
        state,
        road,
        frameOf(state, [PLAYER_RIDER, { ...flatOut, steer }])
      );
    }
    expect(rider.mode).toBe("riding");
    expect(rider.speed).toBeGreaterThan(WALKING_PACE * 2);
    expect(rider.s).toBeGreaterThan(stall.s + 10);
  });

  it("gives a jump that clears it nothing to hit", () => {
    const state = field(road, 1, 0, 0);
    const rider = player(state);
    Object.assign(rider, headOn(stallOn(1, 10), 30));
    rider.airborne = true;
    rider.air = 3;
    stepRace(state, road, frameOf(state, [PLAYER_RIDER, coast]));
    expect(crashes(state.events)).toStrictEqual([]);
  });
});

describe("a pilot at the market", () => {
  it("rides through on the road without touching a stall", () => {
    const state = field(road, 1, 0, 0);
    const rider = player(state);
    rider.s = 1250;
    rider.x = 1.8;
    rider.speed = 40;
    const { events, line } = pilotFrom(state, road, 20);
    expect(rider.s).toBeGreaterThan(1760);
    expect(
      line.filter(({ s, x }) =>
        road.stalls.some((stall) => inside(stall, s, x))
      )
    ).toStrictEqual([]);
    expect(crashes(events).map(({ cause }) => cause)).not.toContain("prop");
  });

  it("gets out of a stall it has remounted inside, and rides on", () => {
    const stall = stallOn(1, 12);
    const state = field(road, 1, 0, 0);
    const rider = player(state);
    rider.s = stall.s;
    rider.x = stall.x;
    rider.speed = 0;
    const { line } = pilotFrom(state, road, 12);
    const last = line.at(-1);
    expect(last && inside(stall, last.s, last.x)).toBeFalsy();
    expect(rider.s).toBeGreaterThan(stall.s + 30);
    expect(Math.abs(rider.x)).toBeLessThan(5);
  });

  it("gets out from behind the row of stalls", () => {
    const stall = stallOn(-1, 12);
    const state = field(road, 1, 0, 0);
    const rider = player(state);
    rider.s = stall.s;
    rider.x = -10.6;
    rider.speed = 4;
    pilotFrom(state, road, 15);
    expect(rider.s).toBeGreaterThan(stall.s + 30);
    expect(Math.abs(rider.x)).toBeLessThan(5);
  });
});

describe("a room's agreement on the stalls", () => {
  it("the setup digest changes when a stall moves, so two clients with different markets fail at once", () => {
    const [first, ...others] = road.stalls;
    if (!first) {
      throw new Error("The market has no stalls.");
    }
    const moved = {
      ...road,
      stalls: [{ ...first, x: first.x + 0.1 }, ...others],
    };
    expect([...trackDigest(moved)]).not.toStrictEqual([...trackDigest(road)]);
  });
});
