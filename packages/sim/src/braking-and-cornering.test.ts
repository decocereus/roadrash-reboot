import { eased } from "@racer/track/alignment";
import { compileTrack, curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { pilotRider } from "./pilot.ts";
import {
  alone,
  cruising,
  frameOf,
  HERMITS_BEND_FROM,
  HERMITS_BEND_TO,
  hold,
  KMH,
  player,
  quietSlagRow,
  quietTrack,
  straight,
  towardTheBike,
} from "./race-fixtures.ts";
import { stepRace } from "./race.ts";
import {
  PLAYER_RIDER,
  TICK_RATE,
  clamp,
  curvePushOf,
  sidewaysRate,
  steerFor,
} from "./state.ts";
import type { BikeSpec, RiderState } from "./state.ts";

const SWITCHBACK_FROM = 1670;

const SWITCHBACK_TO = 1840;

const TURN_IN_BEFORE = 50;

const pushedWideInSwitchback = (bike: BikeSpec, kmh?: number): boolean => {
  const state = alone(quietTrack, bike);
  const rider = player(state);
  rider.s = 900;
  rider.speed = (kmh ?? 180) / 3.6;
  let widest = Number.NEGATIVE_INFINITY;
  while (rider.s < SWITCHBACK_TO) {
    rider.x = 0;
    rider.speed = kmh === undefined ? rider.speed : kmh / 3.6;
    const inBend = rider.s > SWITCHBACK_FROM;
    const turningIn = rider.s > SWITCHBACK_FROM - TURN_IN_BEFORE;
    const inside = Math.sign(curvatureAt(quietTrack, SWITCHBACK_FROM + 60));
    stepRace(
      state,
      quietTrack,
      frameOf(state, [
        PLAYER_RIDER,
        towardTheBike(rider, {
          ...cruising,
          steer: turningIn ? inside : 0,
          throttle: 1,
        }),
      ])
    );
    if (inBend) {
      widest = Math.max(widest, -rider.x * inside);
    }
  }
  return widest > 0;
};

const steerShare = (bike: BikeSpec): number => {
  const state = alone(straight, bike);
  const rider = player(state);
  rider.speed = 40;
  hold(state, straight, { ...cruising, steer: 1, throttle: 0.6 }, 0.05);
  return (
    rider.lateralSpeed / (bike.lateralSpeed + bike.lateralSpeedPerSpeed * 40)
  );
};

const topSpeedKmh = (bike: BikeSpec): number => {
  const state = alone(straight, bike);
  hold(state, straight, { ...cruising, throttle: 1 }, 60);
  return player(state).speed * 3.6;
};

describe("the bike catalogue", () => {
  it("the Wren holds the Switchback at 188 km/h where the Sesta lets go at 156; flat out the Wren scrubs down and holds it where the Sesta is pushed wide", () => {
    const wren = bikes["halden-wren-400"];
    const sesta = bikes["ostra-sesta-600"];
    expect({
      sesta: pushedWideInSwitchback(sesta),
      wren: pushedWideInSwitchback(wren),
    }).toStrictEqual({ sesta: true, wren: false });
    expect({
      sestaAbove: pushedWideInSwitchback(sesta, 156 * 1.05),
      sestaBelow: pushedWideInSwitchback(sesta, 156 * 0.95),
      wrenAbove: pushedWideInSwitchback(wren, 188 * 1.05),
      wrenBelow: pushedWideInSwitchback(wren, 188 * 0.95),
    }).toStrictEqual({
      sestaAbove: true,
      sestaBelow: false,
      wrenAbove: true,
      wrenBelow: false,
    });
  });

  it.each([
    { bike: bikes["gutter-pup-250"], kmh: 166 },
    { bike: bikes["halden-kite-500"], kmh: 176 },
    { bike: bikes["ostra-sette-750"], kmh: 152 },
    { bike: bikes["brack-stoker-800"], kmh: 145 },
    { bike: bikes["halden-meridian-900"], kmh: 145 },
    { bike: bikes["brack-anvil-1100"], kmh: 130 },
    { bike: bikes["ostra-nera-1000"], kmh: 138 },
  ])(
    "the $bike.name holds the Switchback up to about $kmh km/h",
    ({ bike, kmh }) => {
      expect({
        above: pushedWideInSwitchback(bike, kmh * 1.05),
        below: pushedWideInSwitchback(bike, kmh * 0.95),
      }).toStrictEqual({ above: true, below: false });
    }
  );

  it("the Gutter Pup answers the bars more slowly than any other bike, and the Wren fastest", () => {
    const settled = Object.values(bikes).map((bike) => ({
      id: bike.id,
      share: steerShare(bike),
    }));
    const slowest = settled.toSorted((left, right) => left.share - right.share);
    expect(slowest.at(0)?.id).toBe("gutter-pup-250");
    expect(slowest.at(-1)?.id).toBe("halden-wren-400");
  });

  it("every Heavyweight is faster flat out than the Sesta, and the Featherweights are slower", () => {
    const sesta = topSpeedKmh(bikes["ostra-sesta-600"]);
    expect(topSpeedKmh(bikes["halden-meridian-900"])).toBeGreaterThan(sesta);
    expect(topSpeedKmh(bikes["brack-anvil-1100"])).toBeGreaterThan(sesta);
    expect(topSpeedKmh(bikes["ostra-nera-1000"])).toBeGreaterThan(sesta);
    expect(topSpeedKmh(bikes["halden-kite-500"])).toBeLessThan(sesta);
    expect(topSpeedKmh(bikes["gutter-pup-250"])).toBeLessThan(160);
  });
});

const sawmillRoad = compileTrack({
  ...straight.plan,
  laneWidth: 3.4,
  lanesEachWay: 1,
  leadInLength: 80,
  pieces: eased([
    [260, 0, 0],
    [200, -20, 0],
    [180, 30, 3],
    [180, -34, 3],
    [140, 0, 6],
    [100, 0, -6],
    [160, 44, -3],
    [120, -40, 0],
    [120, 38, 0],
    [340, 0, -8],
    [220, -60, -4],
    [160, 0, 4],
    [90, 0, 5],
    [90, 0, -6],
    [300, 32, -2],
    [200, -28, 0],
    [220, 0, 0],
    [140, 64, 0],
    [380, 0, 0],
    [200, -26, 0],
    [180, 0, -4],
    [160, 48, -3],
    [140, -44, -2],
    [200, 0, 2],
    [260, 18, 6],
    [100, 0, 4],
    [100, 0, -6],
    [220, -30, -4],
    [140, 52, 0],
    [350, 0, -6],
    [190, -66, -4],
    [220, 24, 0],
    [260, -36, 3],
    [140, 0, 5],
    [100, 0, -7],
    [220, 30, -3],
    [140, -58, 0],
    [160, 50, 0],
    [240, 0, 0],
    [200, -28, 0],
    [150, 66, 0],
    [380, 0, 0],
  ]),
  runoffLength: 400,
  seed: 0x4f_17_e2,
  shoulderWidth: 0.6,
  vergeWidth: 5,
});

const DRY_DOCK_CORNER_FROM = 5120;

const DRY_DOCK_CORNER_TO = 5280;

const SAWMILL_HOOK_FROM = 3080;

const SAWMILL_HOOK_TO = 3240;

interface Cornering {
  readonly entered: number;
  readonly slowest: number;
  readonly left: number;
  readonly widest: number;
  readonly crashed: boolean;
  readonly offRoad: boolean;
}

const feltSteer = (course: Track, rider: RiderState): number => {
  const curvature = curvatureAt(course, rider.s);
  const push = curvePushOf(rider.bike, curvature, rider.speed);
  const drift = rider.lateralSpeed - push;
  const settling =
    (drift * Math.abs(drift)) /
    (2 * sidewaysRate(rider.bike, rider.lateralSpeed, push, push));
  const [lane] = course.sameWayLanes;
  return clamp(
    steerFor(
      rider.bike,
      curvature,
      rider.speed,
      push + (lane - rider.x - settling) * 1.2
    ),
    -1,
    1
  );
};

const throttleHeldThrough = (
  course: Track,
  bike: BikeSpec,
  from: number,
  to: number,
  kmh: number
): Cornering => {
  const state = alone(course, bike);
  const rider = player(state);
  rider.s = from - TURN_IN_BEFORE;
  rider.x = 0;
  rider.speed = kmh / KMH;
  rider.gear = bike.gears.length;
  const inside = Math.sign(curvatureAt(course, from + 60));
  const input = { ...cruising, throttle: 1 };
  let slowest = rider.speed;
  let widest = 0;
  let offRoad = false;
  let crashed = false;
  while (rider.s < to && rider.mode === "riding") {
    input.steer = feltSteer(course, rider);
    stepRace(state, course, frameOf(state, [PLAYER_RIDER, input]));
    slowest = Math.min(slowest, rider.speed);
    widest = Math.max(widest, -rider.x * inside);
    offRoad ||= rider.offRoad;
    crashed ||= state.events.some((event) => event.kind === "crash");
  }
  return {
    crashed,
    entered: kmh,
    left: rider.speed * KMH,
    offRoad,
    slowest: slowest * KMH,
    widest,
  };
};

const lockedFor = (bike: BikeSpec, steer: number, seconds: number) => {
  const state = alone(straight, bike);
  const rider = player(state);
  rider.speed = 45;
  rider.gear = bike.gears.length;
  let moved = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(
      state,
      straight,
      frameOf(state, [PLAYER_RIDER, { ...cruising, steer, throttle: 0 }])
    );
    moved += rider.x;
    rider.x = 0;
  }
  return { moved, speed: rider.speed };
};

describe("cornering with the throttle held", () => {
  it("a Wren that holds the throttle into Hermit's Bend at 190 km/h scrubs down into the 140s, stays on the road, and leaves slower than it arrived", () => {
    const run = throttleHeldThrough(
      quietTrack,
      bikes["halden-wren-400"],
      HERMITS_BEND_FROM,
      HERMITS_BEND_TO,
      190
    );
    expect(run.crashed).toBeFalsy();
    expect(run.offRoad).toBeFalsy();
    expect(run.slowest).toBeGreaterThan(130);
    expect(run.slowest).toBeLessThan(165);
    expect(run.left).toBeLessThan(run.entered - 20);
  });

  it("a Sesta holding the throttle into Dry Dock Corner at 190 km/h runs out of road, and a lift with no brake gets it round", () => {
    const held = throttleHeldThrough(
      quietSlagRow,
      bikes["ostra-sesta-600"],
      DRY_DOCK_CORNER_FROM,
      DRY_DOCK_CORNER_TO,
      190
    );
    expect(held.offRoad || held.crashed).toBeTruthy();
    const state = alone(quietSlagRow, bikes["ostra-sesta-600"]);
    const rider = player(state);
    rider.s = DRY_DOCK_CORNER_FROM - TURN_IN_BEFORE;
    rider.x = 0;
    rider.speed = 190 / KMH;
    rider.gear = 6;
    const input = { ...cruising, throttle: 0 };
    while (rider.s < DRY_DOCK_CORNER_TO && rider.mode === "riding") {
      pilotRider(state, quietSlagRow, rider);
      Object.assign(input, rider.input, {
        brake: 0,
        throttle: rider.speed * KMH > 110 ? 0 : 1,
      });
      stepRace(state, quietSlagRow, frameOf(state, [PLAYER_RIDER, input]));
      expect(rider.offRoad).toBeFalsy();
    }
    expect(rider.mode).toBe("riding");
  });

  it("the Sawmill Hook at 190 km/h on a Sesta is a brake bend: the throttle held runs out of road", () => {
    const held = throttleHeldThrough(
      sawmillRoad,
      bikes["ostra-sesta-600"],
      SAWMILL_HOOK_FROM,
      SAWMILL_HOOK_TO,
      190
    );
    expect(held.offRoad || held.crashed).toBeTruthy();
  });

  it("a heavyweight at full lock scrubs less speed and moves less sideways than a featherweight", () => {
    const scrubOf = (bike: BikeSpec) =>
      lockedFor(bike, 0, 2).speed - lockedFor(bike, 1, 2).speed;
    const wren = bikes["halden-wren-400"];
    const anvil = bikes["brack-anvil-1100"];
    expect(scrubOf(wren)).toBeGreaterThan(scrubOf(anvil) * 1.2);
    expect(scrubOf(wren)).toBeGreaterThan(8);
    expect(lockedFor(anvil, 1, 1).moved).toBeLessThan(
      lockedFor(wren, 1, 1).moved
    );
  });
});
