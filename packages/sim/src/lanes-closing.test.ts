import { eased } from "@racer/track/alignment";
import { roadHalfWidthAt } from "@racer/track/districts";
import type { Districts } from "@racer/track/districts";
import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { breakwaterRun } from "@racer/track/tracks/breakwater-run";
import { describe, expect, it } from "vitest";

import { difficulties, tiers } from "./difficulty.ts";
import { frameOf, player } from "./race-fixtures.ts";
import { createRace, defaultSetup, emptyFrame, stepRace } from "./race.ts";
import { setupDigest } from "./snapshot-setup.ts";
import {
  restoreSnapshot,
  snapshotCapacity,
  writeSnapshot,
} from "./snapshot.ts";
import { TICK_RATE } from "./state.ts";
import type {
  RaceConditions,
  RaceState,
  RiderState,
  TrafficCar,
} from "./state.ts";
import { carSlant } from "./traffic.ts";

const NARROW_FROM = 2000;
const WIDE_AGAIN_FROM = 2600;
const TAPER = 60;

const threeOneThree = {
  shoulderWidth: 0.9,
  vergeWidth: 7,
};

const districts: Districts = [
  { ...threeOneThree, from: 0, lanesEachWay: 3 },
  { ...threeOneThree, from: NARROW_FROM, lanesEachWay: 1 },
  { ...threeOneThree, from: WIDE_AGAIN_FROM, lanesEachWay: 3 },
];

const road = compileTrack({
  ...breakwaterRun,
  carriers: [],
  chevrons: [],
  crossings: [],
  crowds: [],
  districts,
  hazardsPerKilometre: 0,
  pieces: eased([[6000, 0, 0]]),
  trafficPerKilometre: 0,
});

const raceOn = (track: Track): RaceState => {
  const setup = defaultSetup(track, 1);
  return createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

const carAt = (s: number, home: number, cruise: number): TrafficCar => ({
  carrier: false,
  cruiseSpeed: cruise,
  halfLength: 2.6,
  halfWidth: 1,
  height: 2.1,
  home,
  paint: 1,
  patience: 120,
  s,
  speed: cruise,
  waited: 0,
  x: home,
});

const overlapping = (cars: readonly TrafficCar[]): boolean =>
  cars.some((car, index) =>
    cars.some(
      (other, otherIndex) =>
        otherIndex > index &&
        Math.abs(car.s - other.s) < car.halfLength + other.halfLength &&
        Math.abs(car.x - other.x) < car.halfWidth + other.halfWidth
    )
  );

const directions = [
  {
    approach: 1400,
    direction: 1,
    lanes: road.sameWayLanes,
    name: "same way",
    opensAt: WIDE_AGAIN_FROM,
    past: WIDE_AGAIN_FROM + 2 * TAPER + 60,
  },
  {
    approach: 3200,
    direction: -1,
    lanes: road.oncomingLanes,
    name: "oncoming",
    opensAt: NARROW_FROM,
    past: NARROW_FROM - 2 * TAPER - 60,
  },
] as const;

describe.each(directions)(
  "cars $name where the road opens again",
  ({ direction, lanes, opensAt }) => {
    it.each([20, 23, 27])(
      "a car moving back to its lane stops behind a car stopped there, from %i m/s",
      (cruise) => {
        const state = raceOn(road);
        const home = lanes[1] ?? 0;
        const stoppedAt = opensAt + direction * (TAPER + 36);
        const stopped = carAt(stoppedAt, home, direction * 20);
        const behind = carAt(
          stoppedAt - direction * 240,
          home,
          direction * cruise
        );
        state.cars.length = 0;
        state.cars.push(stopped, behind);
        let closest = Number.POSITIVE_INFINITY;
        for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
          stopped.s = stoppedAt;
          stopped.speed = 0;
          stepRace(state, road, frameOf(state));
          closest = Math.min(
            closest,
            (stoppedAt - behind.s) * direction -
              stopped.halfLength -
              behind.halfLength
          );
        }
        expect(Math.abs(behind.speed)).toBe(0);
        expect(closest).toBeGreaterThan(0);
      }
    );
  }
);

describe.each(directions)(
  "cars $name where a lane closes",
  ({ approach, direction, lanes, past }) => {
    const closingRide = () => {
      const state = raceOn(road);
      const [inner, middle, outer] = lanes;
      const lanesAcross = [inner, middle, outer ?? inner];
      state.cars.length = 0;
      for (let row = 0; row < 4; row += 1) {
        for (const [lane, home] of lanesAcross.entries()) {
          state.cars.push(
            carAt(
              approach - direction * (row * 18 + lane * 0.5),
              home ?? 0,
              direction * (20 + lane)
            )
          );
        }
      }
      const homes = state.cars.map((car) => car.home);
      let overlaps = 0;
      let singleFile = true;
      let sawNarrow = false;
      for (let tick = 0; tick < 240 * TICK_RATE; tick += 1) {
        stepRace(state, road, frameOf(state));
        overlaps += overlapping(state.cars) ? 1 : 0;
        for (const car of state.cars) {
          if (car.s > NARROW_FROM && car.s < WIDE_AGAIN_FROM) {
            sawNarrow = true;
            singleFile &&= car.x === lanes[0];
          }
        }
        if (state.cars.every((car) => (car.s - past) * direction > 0)) {
          break;
        }
      }
      return { homes, overlaps, sawNarrow, singleFile, state };
    };

    it("files them into the open lane with no two cars overlapping, and sends each home after", () => {
      const { homes, overlaps, sawNarrow, singleFile, state } = closingRide();
      expect(sawNarrow).toBeTruthy();
      expect(singleFile).toBeTruthy();
      expect(overlaps).toBe(0);
      expect(
        state.cars.every((car) => (car.s - past) * direction > 0)
      ).toBeTruthy();
      expect(state.cars.map((car) => car.x)).toStrictEqual(homes);
    });
  }
);

describe("a car's slant while it changes lane", () => {
  const [inner, , outer = 0] = road.sameWayLanes;
  const across = road.plan.laneWidth / 30;
  const middleOfMerge = NARROW_FROM - TAPER - 15;

  it("points an outer lane's car across the road where its seat is closing", () => {
    expect(carSlant(carAt(0, outer, 20), road, middleOfMerge)).toBeCloseTo(
      -across,
      6
    );
    expect(carSlant(carAt(0, -outer, -20), road, middleOfMerge)).toBeCloseTo(
      across,
      6
    );
  });

  it("leaves the open lane's car and a car on open road straight", () => {
    expect(carSlant(carAt(0, inner, 20), road, middleOfMerge)).toBe(0);
    expect(carSlant(carAt(0, outer, 20), road, 400)).toBe(0);
  });
});

describe("a car's x on a road of districts", () => {
  it("follows the road's reach after a snapshot restore", () => {
    const track = compileTrack({
      ...breakwaterRun,
      carriers: [],
      districts: [
        { ...threeOneThree, from: 0, lanesEachWay: 3 },
        { ...threeOneThree, from: 3000, lanesEachWay: 1 },
        { ...threeOneThree, from: 3600, lanesEachWay: 2 },
      ],
    });
    const setup = defaultSetup(track, 3);
    const state = createRace(setup);
    for (let tick = 0; tick < 30 * TICK_RATE; tick += 1) {
      stepRace(state, track, frameOf(state));
    }
    const bytes = new DataView(new ArrayBuffer(snapshotCapacity(state)));
    writeSnapshot(state, setupDigest(state, track), bytes);
    const restored = restoreSnapshot(setup, bytes);
    expect(restored.cars.map((car) => car.x)).toStrictEqual(
      state.cars.map((car) => car.x)
    );
    expect(state.cars.some((car) => car.x !== car.home)).toBeTruthy();
  });

  it("stays at home for every car of a road of one district", () => {
    const track = compileTrack({
      ...breakwaterRun,
      districts: [{ ...threeOneThree, from: 0, lanesEachWay: 3 }],
    });
    const state = createRace(defaultSetup(track, 3));
    for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
      stepRace(state, track, frameOf(state));
      expect(state.cars.every((car) => car.x === car.home)).toBeTruthy();
    }
    expect(new Set(state.cars.map((car) => car.x)).size).toBe(6);
  });
});

describe("a pilot nearing a narrow district", () => {
  it("passes a slow car on a line that stays open past the taper", () => {
    const setup = defaultSetup(road, 1);
    const state = createRace({
      ...setup,
      player: { ...setup.player, controller: "pilot" },
      police: { ...setup.police, count: 0 },
      rivals: [],
    });
    const rider = player(state);
    const [lane] = road.sameWayLanes;
    rider.s = NARROW_FROM - TAPER - 90;
    rider.x = lane;
    rider.speed = 45;
    state.cars.length = 0;
    state.cars.push(carAt(rider.s + 60, lane, 15));
    let widest = 0;
    while (rider.s < NARROW_FROM && rider.mode === "riding") {
      stepRace(state, road, emptyFrame);
      widest = Math.max(widest, rider.x);
    }
    expect(rider.mode).toBe("riding");
    expect(widest).toBeLessThan(roadHalfWidthAt(road, NARROW_FROM));
  });
});

const FASTER_THAN_A_REMOUNT = 15;

const raceIsOver = (rider: RiderState): boolean =>
  rider.finishTick >= 0 || rider.mode === "wrecked";

describe("a pilot field on Breakwater Run's districts", () => {
  const raceTicks = 60 * 420;
  const fieldSeeds = [11, 23, 37, 41, 59, 67, 73, 89];
  const fieldRide = (
    track: Track,
    seed: number,
    conditions: RaceConditions
  ) => {
    const setup = defaultSetup(track, seed);
    const state = createRace({
      ...setup,
      conditions,
      pacing: { catchUp: 0, leadEase: 0 },
      player: { ...setup.player, controller: "pilot" },
      police: { ...setup.police, count: 0 },
    });
    let offRoad = 0;
    for (
      let tick = 0;
      tick < raceTicks && !state.riders.every(raceIsOver);
      tick += 1
    ) {
      stepRace(state, track, emptyFrame);
      for (const rider of state.riders) {
        if (
          rider.finishTick < 0 &&
          rider.mode === "riding" &&
          rider.offRoad &&
          rider.speed > FASTER_THAN_A_REMOUNT
        ) {
          offRoad += 1;
        }
      }
    }
    return {
      ended: state.riders.filter(raceIsOver).length,
      offRoad,
      riders: state.riders.length,
    };
  };

  const fieldsOn = (track: Track, conditions: RaceConditions) => {
    const rides = fieldSeeds.map((seed) => fieldRide(track, seed, conditions));
    return {
      ended: rides.reduce((sum, ride) => sum + ride.ended, 0),
      offRoad: rides.reduce((sum, ride) => sum + ride.offRoad, 0),
      riders: rides.reduce((sum, ride) => sum + ride.riders, 0),
    };
  };

  const across = (track: Track) =>
    tiers.map((tier) => fieldsOn(track, difficulties[tier].conditions));

  const offRoadOf = (fields: ReturnType<typeof across>): number =>
    fields.reduce((sum, field) => sum + field.offRoad, 0);

  it("leaves no rider on the road at any tier, and off it no more over the tiers than on a road of one width", () => {
    const plan = roads["breakwater-run"];
    const uniform = across(
      compileTrack({
        ...plan,
        districts: [
          { from: 0, lanesEachWay: 2, shoulderWidth: 0.9, vergeWidth: 7 },
        ],
      })
    );
    const districted = across(compileTrack(plan));
    expect(districted.map((field) => field.ended)).toStrictEqual(
      districted.map((field) => field.riders)
    );
    expect(offRoadOf(districted)).toBeLessThanOrEqual(offRoadOf(uniform));
  }, 600_000);
});

describe("a convoy on Breakwater Run in a full race", () => {
  const CONVOY_CRUISE = 15;
  const CONVOY_CARS = 6;
  const CLEAR_METRES = 30;
  const track = compileTrack(roads["breakwater-run"]);
  const [innerLane] = track.sameWayLanes;

  const raceWithConvoyAt = (seed: number, leadS: number) => {
    const setup = defaultSetup(track, seed);
    const state = createRace({
      ...setup,
      conditions: difficulties[3].conditions,
      pacing: { catchUp: 0, leadEase: 0 },
      player: { ...setup.player, controller: "pilot" },
      police: { ...setup.police, count: 0 },
    });
    const convoy = state.cars
      .filter((car) => car.cruiseSpeed === CONVOY_CRUISE && !car.carrier)
      .slice(0, CONVOY_CARS);
    const shift = leadS - Math.max(...convoy.map((car) => car.s));
    for (const car of convoy) {
      car.s += shift;
    }
    const clear = state.cars.filter(
      (car) =>
        convoy.includes(car) ||
        car.cruiseSpeed < 0 ||
        convoy.every((other) => Math.abs(other.s - car.s) >= CLEAR_METRES)
    );
    state.cars.length = 0;
    state.cars.push(...clear);
    return { convoy, state };
  };

  const squeeze = { from: 1300, to: 1740 };
  const neck = { from: 3900, to: 4220 };

  const rideThrough = (
    seed: number,
    leadS: number,
    exit: number,
    oneLane: { readonly from: number; readonly to: number } = squeeze
  ) => {
    const { convoy, state } = raceWithConvoyAt(seed, leadS);
    const homes = convoy.map((car) => car.home);
    let overlaps = 0;
    let offTheRoad = 0;
    let singleFile = true;
    let sawOneLane = false;
    for (let tick = 0; tick < 150 * TICK_RATE; tick += 1) {
      stepRace(state, track, emptyFrame);
      overlaps += overlapping(state.cars) ? 1 : 0;
      for (const car of convoy) {
        offTheRoad +=
          Math.abs(car.x) + car.halfWidth > roadHalfWidthAt(track, car.s)
            ? 1
            : 0;
        if (car.s > oneLane.from && car.s < oneLane.to) {
          sawOneLane = true;
          singleFile &&= car.x === innerLane;
        }
      }
      if (convoy.every((car) => car.s > exit)) {
        break;
      }
    }
    return {
      allOut: convoy.every((car) => car.s > exit),
      backHome: convoy.map((car) => car.x),
      homes,
      offTheRoad,
      overlaps,
      sawOneLane,
      singleFile,
    };
  };

  it.each([11, 23, 59, 67])(
    "files through the one-lane squeeze as the pack arrives, seed %i",
    (seed) => {
      const { backHome, homes, ...ride } = rideThrough(seed, 900, 1880);
      expect(ride).toStrictEqual({
        allOut: true,
        offTheRoad: 0,
        overlaps: 0,
        sawOneLane: true,
        singleFile: true,
      });
      expect(backHome).toStrictEqual(homes);
    },
    60_000
  );

  it.each([11, 23, 59, 67])(
    "files through the one-lane neck as the pack arrives, seed %i",
    (seed) => {
      expect(rideThrough(seed, 2550, 4360, neck)).toMatchObject({
        allOut: true,
        offTheRoad: 0,
        overlaps: 0,
        sawOneLane: true,
        singleFile: true,
      });
    },
    60_000
  );

  it.each([11, 59])(
    "closes from three lanes to two at the seafront, seed %i",
    (seed) => {
      expect(rideThrough(seed, 3200, 3700)).toMatchObject({
        allOut: true,
        offTheRoad: 0,
        overlaps: 0,
      });
    },
    60_000
  );
});
