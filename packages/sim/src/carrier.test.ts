import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { streetBike } from "./bikes.ts";
import { carrierAt } from "./carrier.ts";
import { alone, frameOf, player, truckRoad } from "./race-fixtures.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { PLAYER_RIDER, TICK_RATE } from "./state.ts";
import type { RaceEvent, RiderInput } from "./state.ts";

const TRUCK_AT = 1000;
const RIG_HALF_LENGTH = 14.35;
const LANE = -1.8;

const holding: RiderInput = { ...neutralInput, throttle: 0 };

const rideAt = (kmh: number, x: number, behind = 40, input = holding) => {
  const state = alone(truckRoad, streetBike);
  const rider = player(state);
  state.cars.length = 0;
  const truck = carrierAt(TRUCK_AT, LANE, 0, 120);
  state.cars.push(truck);
  rider.s = TRUCK_AT - RIG_HALF_LENGTH - behind;
  rider.x = x;
  rider.speed = kmh / 3.6;
  const events: RaceEvent[] = [];
  let highest = 0;
  let wentOver = false;
  for (let tick = 0; tick < 15 * TICK_RATE; tick += 1) {
    rider.speed = rider.mode === "riding" ? kmh / 3.6 : rider.speed;
    stepRace(state, truckRoad, frameOf(state, [PLAYER_RIDER, input]));
    events.push(...state.events);
    highest = Math.max(highest, rider.air);
    wentOver ||= rider.mode === "riding" && rider.s > truck.s + RIG_HALF_LENGTH;
    if (wentOver && !rider.airborne) {
      break;
    }
  }
  return { events, highest, rider, truck, wentOver };
};

interface PilotRun {
  readonly events: readonly RaceEvent[];
  readonly landedAt: number;
  readonly landedTick: number;
  readonly launchKmh: number;
  readonly passed: boolean;
  readonly rampTaken: boolean;
}

const pilotMeets = (
  kmh: number,
  holdPace: boolean,
  skill: number,
  seed: number,
  carAhead?: { readonly s: number; readonly speed: number }
): PilotRun => {
  const setup = defaultSetup(truckRoad, seed);
  const state = createRace({
    ...setup,
    player: { ...setup.player, bike: streetBike, controller: "pilot", skill },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
  const rider = player(state);
  const truck = state.cars.at(-1);
  if (truck?.carrier !== true) {
    throw new Error("The road's truck comes last among its cars.");
  }
  state.cars.splice(0, state.cars.length - 1);
  if (carAhead) {
    state.cars.unshift({
      ...truck,
      carrier: false,
      cruiseSpeed: carAhead.speed,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      s: carAhead.s,
      speed: carAhead.speed,
      x: carAhead.speed < 0 ? truckRoad.oncomingLanes[0] : truck.x,
    });
  }
  rider.s = truck.s - RIG_HALF_LENGTH - 200;
  rider.x = truck.x;
  rider.speed = kmh / 3.6;
  const events: RaceEvent[] = [];
  let rampTaken = false;
  let landedAt = 0;
  let landedTick = 0;
  let launchKmh = 0;
  for (let tick = 0; tick < 40 * TICK_RATE; tick += 1) {
    if (holdPace && rider.mode === "riding") {
      rider.speed = kmh / 3.6;
    }
    stepRace(state, truckRoad, frameOf(state));
    events.push(...state.events);
    rampTaken ||= rider.onCarrier >= 0;
    if (launchKmh === 0 && rider.airborne) {
      launchKmh = rider.speed * 3.6;
    }
    if (landedAt === 0 && state.events.some(({ kind }) => kind === "land")) {
      landedAt = rider.s;
      landedTick = state.tick;
    }
    if (rider.s > truck.s + 400) {
      break;
    }
  }
  return {
    events,
    landedAt,
    landedTick,
    launchKmh,
    passed: rider.mode === "riding" && rider.s > truck.s + RIG_HALF_LENGTH,
    rampTaken,
  };
};

const carOnLanding = (kmh: number) => {
  const { landedAt, landedTick } = pilotMeets(kmh, false, 1, 1);
  const speed = 20;
  return { s: landedAt + 10 - speed * (landedTick / TICK_RATE), speed };
};

const crashed = (events: readonly RaceEvent[]): boolean =>
  events.some((event) => event.kind === "crash");

describe("the moving carrier jump", () => {
  it("a rider hitting the ramp at 160 km/h behind a 72 km/h truck clears both decks and lands riding", () => {
    const { events, highest, rider, wentOver } = rideAt(160, LANE);
    expect(crashed(events)).toBeFalsy();
    expect(wentOver).toBeTruthy();
    expect(highest).toBeGreaterThan(4.22);
    expect(rider.mode).toBe("riding");
    expect(events.some((event) => event.kind === "land")).toBeTruthy();
  });

  it("a rider at 280 km/h flies further and still lands riding", () => {
    const { events, rider, wentOver } = rideAt(280, LANE);
    expect(crashed(events)).toBeFalsy();
    expect(wentOver).toBeTruthy();
    expect(rider.mode).toBe("riding");
  });

  it("a rider barely faster than the truck comes down on it and crashes", () => {
    const { events, wentOver } = rideAt(115, LANE);
    expect(crashed(events)).toBeTruthy();
    expect(wentOver).toBeFalsy();
  });

  it.each([80, 90, 100])(
    "a rider going up the ramp at only %i km/h falls into the truck and crashes, however gently",
    (kmh) => {
      const { events, wentOver } = rideAt(kmh, LANE, 5);
      expect(crashed(events)).toBeTruthy();
      expect(wentOver).toBeFalsy();
    }
  );

  it("how high the rider goes depends on speed relative to the truck", () => {
    expect(rideAt(150, LANE).highest).toBeGreaterThan(
      rideAt(120, LANE).highest
    );
  });

  it("riding into the back of the truck beside the ramp is a crash", () => {
    const { events } = rideAt(160, LANE + 1.3, 0);
    expect(crashed(events)).toBeTruthy();
  });

  it("a rider in the next lane passes the whole rig on the road without leaving the ground", () => {
    const { events, highest, rider, wentOver } = rideAt(160, LANE + 3.6);
    expect(crashed(events)).toBeFalsy();
    expect(highest).toBe(0);
    expect(wentOver).toBeTruthy();
    expect(rider.mode).toBe("riding");
  });

  it("a rider steering off the side of the ramp falls off it", () => {
    const { rider } = rideAt(160, LANE, 40, { ...holding, steer: 1 });
    expect(rider.onCarrier).toBe(-1);
  });

  it("the truck keeps driving down its lane as traffic", () => {
    const { truck } = rideAt(160, LANE);
    expect(truck.s).toBeGreaterThan(TRUCK_AT);
    expect(truck.speed).toBeCloseTo(20, 0);
  });
});

describe("trucks on the roads", () => {
  it.each([
    ["breakwater-run", 1, [2350, 3200]],
    ["cinder-wash", 1, [2600, 3300]],
    ["hollow-pine-road", 1, [1000, 2600]],
    ["slag-row", 1, [2600, 4100]],
    ["slag-row", 3, [2600, 4100]],
    ["slag-row", 4, [2600, 4100, 5900]],
    ["ridge-road", 1, [4500]],
  ] as const)(
    "%s at level %i starts its trucks at the plan's stretches, in the first lane the same way, first among the cars",
    (road, level, starts) => {
      const track = trackFor(road, level);
      const { cars } = createRace(defaultSetup(track, 1));
      const trucks = cars.slice(cars.length - starts.length);
      expect(trucks.map((car) => car.s)).toStrictEqual([...starts]);
      expect(trucks.every((car) => car.carrier)).toBeTruthy();
      expect(
        trucks.every((car) => car.x === track.sameWayLanes[0])
      ).toBeTruthy();
      expect(
        cars.slice(0, cars.length - starts.length).some((car) => car.carrier)
      ).toBeFalsy();
    }
  );
});

describe("a pilot and a truck", () => {
  it("jumps a truck it catches fast enough in its own lane and lands riding", () => {
    const run = pilotMeets(200, false, 1, 1);
    expect(run.rampTaken).toBeTruthy();
    expect(run.landedAt).toBeGreaterThan(0);
    expect(run.passed).toBeTruthy();
    expect(crashed(run.events)).toBeFalsy();
  });

  it("goes round when a car would sit in the landing stretch as it comes down", () => {
    const run = pilotMeets(200, false, 1, 1, carOnLanding(200));
    expect(run.rampTaken).toBeFalsy();
    expect(run.passed).toBeTruthy();
    expect(crashed(run.events)).toBeFalsy();
  });

  it("still jumps when the same car is well past the landing stretch", () => {
    const { s, speed } = carOnLanding(200);
    const run = pilotMeets(200, false, 1, 1, { s: s + 300, speed });
    expect(run.rampTaken).toBeTruthy();
    expect(crashed(run.events)).toBeFalsy();
  });

  it("a committed pilot keeps its speed for the jump with oncoming traffic closing the way round", () => {
    const run = pilotMeets(160, false, 1, 1, { s: 1600, speed: -20 });
    expect(run.rampTaken).toBeTruthy();
    expect(run.launchKmh).toBeGreaterThan(190);
    expect(run.landedAt).toBeGreaterThan(0);
    expect(run.passed).toBeTruthy();
    expect(crashed(run.events)).toBeFalsy();
  });

  it("goes round when it is too slow to clear the decks", () => {
    const run = pilotMeets(110, true, 1, 1);
    expect(run.rampTaken).toBeFalsy();
    expect(run.passed).toBeTruthy();
    expect(crashed(run.events)).toBeFalsy();
  });

  it("an unskilled pilot sometimes misjudges a jump it cannot make and a skilled one never does", () => {
    const seeds = Array.from({ length: 30 }, (_, index) => index + 1);
    const tries = (skill: number): number =>
      seeds.filter((seed) => pilotMeets(110, true, skill, seed).rampTaken)
        .length;
    expect(tries(1)).toBe(0);
    expect(tries(0.5)).toBeGreaterThan(0);
    expect(tries(0.5)).toBeLessThan(seeds.length);
  });
});
