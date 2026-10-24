import { eased } from "@racer/track/alignment";
import { hazardSizes } from "@racer/track/hazards";
import { compileTrack, curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { streetBike } from "./bikes.ts";
import {
  KMH,
  boulder,
  cruising,
  effectsOf,
  field,
  flatOut,
  frameOf,
  hazardFreeRoad,
  hold,
  placedAt,
  player,
  roadWith,
  slick,
  slowTruckAt,
} from "./race-fixtures.ts";
import type { Placement } from "./race-fixtures.ts";
import { stepRace } from "./race.ts";
import {
  BIKE_HALF_WIDTH,
  PLAYER_RIDER,
  TICK_RATE,
  clamp,
  curvePushOf,
  lateralSpeedLimit,
  steerFor,
} from "./state.ts";
import type { RaceEvent } from "./state.ts";

const rideAt = (
  road: Track,
  from: Placement,
  steerFrom: number,
  steer: number,
  seconds: number
) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = from.s;
  rider.x = from.x;
  rider.speed = from.speed;
  rider.lateralSpeed = from.lateralSpeed;
  const events: RaceEvent[] = [];
  let shakiest = 0;
  let highest = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(
      state,
      road,
      frameOf(state, [
        PLAYER_RIDER,
        { ...flatOut, steer: rider.s > steerFrom ? steer : 0 },
      ])
    );
    events.push(...state.events);
    shakiest = Math.max(shakiest, rider.wobble);
    highest = Math.max(highest, rider.airborne ? rider.air : 0);
  }
  return {
    crashes: events.flatMap((event) => (event.kind === "crash" ? [event] : [])),
    events,
    highest,
    rider,
    shakiest,
  };
};

const hole = roadWith(placedAt("pothole", 1000, 1.8, "hole"));

const atSpeed = (kmh: number): Placement => ({
  lateralSpeed: 0,
  s: 996 - (0.6 * kmh) / KMH,
  speed: kmh / KMH,
  x: 1.8,
});

const acrossInHalfASecond = (road: Track): number => {
  const run = rideAt(road, { ...atSpeed(90), s: 994 }, 996, 0.5, 0.5);
  return Math.abs(run.rider.x - 1.8);
};

const leaned = (kmh: number) => {
  const speed = kmh / KMH;
  const sideways = lateralSpeedLimit(streetBike, speed);
  return rideAt(
    hole,
    {
      lateralSpeed: sideways,
      s: 996 - 0.1 * speed,
      speed,
      x: 1.8 - 0.1 * sideways,
    },
    0,
    1,
    1.5
  ).crashes.map((crash) => ({ id: crash.hazard?.id, kmh: crash.speed * KMH }));
};

const gentleBend = compileTrack({
  ...ridgeRoad,
  chevrons: [],
  features: [],
  hazardsPerKilometre: 0,
  pieces: eased([
    [600, 0, 0],
    [600, 34, 0],
    [3000, 0, 0],
  ]),
  trafficPerKilometre: 0,
});

const throughGentleBend = (kmh: number, rockX: number) => {
  const road: Track = {
    ...gentleBend,
    hazards: [placedAt("rock", 900, rockX, "edge")],
  };
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = 820;
  rider.x = 1.8;
  rider.speed = kmh / KMH;
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 3 * TICK_RATE; tick += 1) {
    const curvature = curvatureAt(road, rider.s);
    const steer = clamp(
      steerFor(
        rider.bike,
        curvature,
        rider.speed,
        (1.8 - rider.x) * 1.2 + curvePushOf(rider.bike, curvature, rider.speed)
      ),
      -1,
      1
    );
    stepRace(
      state,
      road,
      frameOf(state, [
        PLAYER_RIDER,
        { ...cruising, steer, throttle: rider.speed < kmh / KMH ? 1 : 0 },
      ])
    );
    events.push(...state.events);
  }
  return {
    crashes: events.filter((event) => event.kind === "crash"),
    effects: effectsOf(events),
  };
};

const climbThenFlat = compileTrack({
  ...ridgeRoad,
  chevrons: [],
  features: [],
  hazardsPerKilometre: 0,
  pieces: eased([
    [2000, 0, 100],
    [4000, 0, 0],
  ]),
  trafficPerKilometre: 0,
});

const rockOn = (road: Track, kmh: number) =>
  rideAt(
    { ...road, hazards: [placedAt("rock", 1000, 1.8, "boulder")] },
    { lateralSpeed: 0, s: 998.5, speed: kmh / KMH, x: 1.8 },
    0,
    0,
    3
  );

const steeringHardInto = (kmh: number) => {
  const speed = kmh / KMH;
  const sideways = lateralSpeedLimit(streetBike, speed);
  return rideAt(
    boulder,
    {
      lateralSpeed: sideways,
      s: 996 - 0.6 * speed,
      speed,
      x: 1.8 - 0.6 * sideways,
    },
    0,
    1,
    3
  );
};

const truckOver = (road: Track) => {
  const state = field(road, 1, 0, 0);
  player(state).s = 100;
  slowTruckAt(state, 950, 1.8);
  const trace: number[] = [];
  for (let tick = 0; tick < 35 * TICK_RATE; tick += 1) {
    stepRace(state, road, frameOf(state));
    const [car] = state.cars;
    trace.push(car?.s ?? Number.NaN, car?.x ?? Number.NaN, car?.speed ?? 0);
  }
  return trace;
};

describe("road hazards", () => {
  it("a rider who holds a steady line straight over an oil slick at 220 km/h stays up and keeps nearly all their speed", () => {
    const run = rideAt(slick, atSpeed(220), 0, 0, 2);
    const smooth = rideAt(hazardFreeRoad, atSpeed(220), 0, 0, 2);
    expect(run.crashes).toStrictEqual([]);
    expect(effectsOf(run.events)).toStrictEqual(["slip"]);
    expect(run.rider.speed / smooth.rider.speed).toBeGreaterThan(0.95);
  });

  it("full lock across an oil slick at 180 km/h puts the rider down and the crash names the slick; at 70 km/h the bike only slides", () => {
    const fast = rideAt(slick, atSpeed(180), 995, 1, 2);
    expect(
      fast.crashes.map((crash) => [crash.cause, crash.hazard?.id])
    ).toStrictEqual([["hazard", "slick"]]);
    const slow = rideAt(slick, atSpeed(70), 995, 1, 2);
    expect(slow.crashes).toStrictEqual([]);
  });

  it.each([
    ["on the slick", 997],
    ["just past it", 1004],
  ])(
    "a quarter-second tap of the bars %s at 160 km/h does not put the rider down",
    (_where, tapFrom) => {
      const state = field(slick, 1, 0, 0);
      const rider = player(state);
      rider.s = 960;
      rider.x = 1.8;
      rider.speed = 160 / KMH;
      let tapped = 0;
      const events: RaceEvent[] = [];
      for (let tick = 0; tick < 2 * TICK_RATE; tick += 1) {
        const tapping = rider.s >= tapFrom && tapped < TICK_RATE / 4;
        tapped += tapping ? 1 : 0;
        stepRace(
          state,
          slick,
          frameOf(state, [PLAYER_RIDER, { ...flatOut, steer: tapping ? 1 : 0 }])
        );
        events.push(...state.events);
      }
      expect(tapped).toBe(TICK_RATE / 4);
      expect(events.filter((event) => event.kind === "crash")).toStrictEqual(
        []
      );
    }
  );

  it("a car drives over a rock, an oil slick, and a pothole in its lane exactly as it drives an empty road", () => {
    const strewn = roadWith(
      placedAt("rock", 1000, 1.8, "boulder"),
      placedAt("oil", 1100, 1.8, "slick"),
      placedAt("pothole", 1200, 1.8, "hole")
    );
    const strewnRun = truckOver(strewn);
    expect(strewnRun.at(-3)).toBeGreaterThan(1250);
    expect(strewnRun).toStrictEqual(truckOver(hazardFreeRoad));
  });

  it("on oil the bars barely bite: half lock moves the bike less than half as far across the road in the next half second", () => {
    expect(acrossInHalfASecond(slick)).toBeLessThan(
      acrossInHalfASecond(hazardFreeRoad) * 0.5
    );
  });

  it.each([130, 150])(
    "a rock hit square at %i km/h bumps the bike into the air, and it lands wobbling, slower, and rides on",
    (kmh) => {
      const run = rideAt(boulder, atSpeed(kmh), 0, 0, 3);
      const smooth = rideAt(hazardFreeRoad, atSpeed(kmh), 0, 0, 3);
      expect({
        crashes: run.crashes,
        effects: effectsOf(run.events),
        mode: run.rider.mode,
      }).toStrictEqual({ crashes: [], effects: ["bump"], mode: "riding" });
      const landing = run.events.find((event) => event.kind === "land");
      expect(landing?.kind === "land" && landing.airSeconds).toBeGreaterThan(
        0.3
      );
      expect(run.shakiest).toBeGreaterThan(0.3);
      const lost = 1 - run.rider.speed / smooth.rider.speed;
      expect(lost).toBeGreaterThan(0.05);
      expect(lost).toBeLessThan(0.25);
    }
  );

  it("a rock hit square at 220 km/h launches the bike, and the landing throws the rider with the crash naming the rock", () => {
    const fast = rideAt(boulder, atSpeed(220), 0, 0, 3);
    expect(effectsOf(fast.events)).toStrictEqual(["bump"]);
    expect(
      fast.crashes.map((crash) => [crash.cause, crash.hazard?.id])
    ).toStrictEqual([["hazard", "boulder"]]);
  });

  it("a rock hit at 160 km/h while steering hard throws the rider, though the same rock ridden straight at 160 km/h does not", () => {
    const hard = steeringHardInto(160);
    expect(effectsOf(hard.events)).toStrictEqual(["bump"]);
    expect(hard.crashes.map((crash) => crash.hazard?.id)).toStrictEqual([
      "boulder",
    ]);
    expect(rideAt(boulder, atSpeed(160), 0, 0, 3).crashes).toStrictEqual([]);
  });

  it("a rock hit at 30 km/h is a stagger that costs over half the speed, and the rider rides on past it", () => {
    const state = field(boulder, 1, 0, 0);
    const slow = player(state);
    Object.assign(slow, atSpeed(30));
    const events = hold(state, boulder, { ...flatOut, throttle: 0 }, 2.5);
    expect(events.filter((event) => event.kind === "crash")).toStrictEqual([]);
    expect(effectsOf(events)).toStrictEqual(["stagger"]);
    const stagger = events.find((event) => event.kind === "hazard");
    expect(stagger?.kind === "hazard" && stagger.speed).toBeLessThan(
      (30 / KMH) * 0.5
    );
    expect(slow.mode).toBe("riding");
    expect(slow.s).toBeGreaterThan(1000 + hazardSizes.rock.halfLength);
  });

  it("a rider who passes a rock close at speed gets a near miss naming it, and one who only clips its edge stays up", () => {
    const touching = 1.8 + hazardSizes.rock.halfWidth + BIKE_HALF_WIDTH;
    const close = rideAt(
      boulder,
      { ...atSpeed(150), x: touching + 0.3 },
      0,
      0,
      1
    );
    expect(close.crashes).toStrictEqual([]);
    expect(
      close.events.flatMap((event) =>
        event.kind === "nearMiss" ? [event.hazard?.id] : []
      )
    ).toStrictEqual(["boulder"]);
    const clipped = rideAt(
      boulder,
      { ...atSpeed(150), x: touching - 0.08 },
      0,
      0,
      1
    );
    expect(clipped.crashes).toStrictEqual([]);
    expect(effectsOf(clipped.events)).toStrictEqual(["stagger"]);
  });

  it("a pothole at 180 km/h is a jolt that costs a few per cent of the speed, and the rider rides on", () => {
    const run = rideAt(hole, atSpeed(180), 0, 0, 1.6);
    expect(run.crashes).toStrictEqual([]);
    expect(effectsOf(run.events)).toStrictEqual(["jolt"]);
    const lost =
      1 -
      rideAt(hole, atSpeed(180), 0, 0, 0.7).rider.speed /
        rideAt(hazardFreeRoad, atSpeed(180), 0, 0, 0.7).rider.speed;
    expect(lost).toBeGreaterThan(0.03);
    expect(lost).toBeLessThan(0.08);
  });

  it("a pothole shakes the bike for under a second and leaves it steady", () => {
    const run = rideAt(hole, atSpeed(180), 0, 0, 1.6);
    expect(run.shakiest).toBeGreaterThan(0.25);
    expect(run.rider.wobble).toBe(0);
  });

  it("a pothole met leaned hard over just above 175 km/h throws the rider, and the same lean 4 km/h slower only shakes the bike", () => {
    const [thrown, ...rest] = leaned(184);
    expect(rest).toStrictEqual([]);
    expect(thrown?.id).toBe("hole");
    expect(thrown?.kmh).toBeGreaterThan(175);
    expect(thrown?.kmh).toBeLessThan(177);
    expect(leaned(180)).toStrictEqual([]);
  });

  it("in a gentle bend a rider holding the lane's centre passes a rock at the lane's edge at 180 km/h, and one who rides over it leaning at 150 km/h stays up", () => {
    const edge = 1.8 - 1.45;
    expect(throughGentleBend(180, edge)).toStrictEqual({
      crashes: [],
      effects: [],
    });
    expect(throughGentleBend(150, 1.8)).toStrictEqual({
      crashes: [],
      effects: ["bump"],
    });
  });

  it("a bike in the air flies over a rock untouched", () => {
    const state = field(boulder, 1, 0, 0);
    const rider = player(state);
    rider.s = 990;
    rider.x = 1.8;
    rider.speed = 40;
    rider.airborne = true;
    rider.air = 1.5;
    rider.verticalSpeed = 2;
    const events = hold(state, boulder, flatOut, 0.5);
    expect(
      events.filter(
        (event) => event.kind === "hazard" || event.kind === "crash"
      )
    ).toStrictEqual([]);
  });

  it("a rock on a climb throws the bike as high as one on the flat: it rides on at 130 km/h and goes down at 220 km/h", () => {
    const flat = rockOn(hazardFreeRoad, 130).highest;
    expect(flat).toBeGreaterThan(0.2);
    expect(
      Math.abs(rockOn(climbThenFlat, 130).highest - flat) / flat
    ).toBeLessThan(0.02);
    expect(rockOn(climbThenFlat, 130).crashes).toStrictEqual([]);
    expect(
      rockOn(climbThenFlat, 220).crashes.map((crash) => crash.hazard?.id)
    ).toStrictEqual(["boulder"]);
  });

  it("a rock lying in an oil slick still bumps the bike: every hazard touched acts", () => {
    const run = rideAt(
      roadWith(
        placedAt("oil", 999.9, 1.8, "slick"),
        placedAt("rock", 1000, 1.8, "boulder")
      ),
      { lateralSpeed: 0, s: 990, speed: 50, x: 1.8 },
      0,
      0,
      0.5
    );
    expect(effectsOf(run.events)).toStrictEqual(["slip", "bump"]);
  });

  it("a bike already steering clear of a rock sideways does not touch it as it passes", () => {
    const run = rideAt(
      roadWith(placedAt("rock", 1000, 0, "boulder")),
      { lateralSpeed: 4, s: 998.1, speed: 54, x: 0.82 },
      0,
      1,
      0.3
    );
    expect(effectsOf(run.events)).toStrictEqual([]);
  });

  it("a bike landing just past a pothole it flew over does not drop into it", () => {
    const state = field(
      roadWith(placedAt("pothole", 996.6, 1.8, "hole")),
      1,
      0,
      0
    );
    const rider = player(state);
    rider.s = 998;
    rider.x = 1.8;
    rider.speed = 54;
    rider.airborne = true;
    rider.air = 0.1;
    rider.verticalSpeed = -8;
    stepRace(
      state,
      roadWith(placedAt("pothole", 996.6, 1.8, "hole")),
      frameOf(state, [PLAYER_RIDER, flatOut])
    );
    expect(state.events.map((event) => event.kind)).toStrictEqual(["land"]);
  });
});
