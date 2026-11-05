import { eased } from "@racer/track/alignment";
import { roadHalfWidthAt } from "@racer/track/districts";
import { roads, trackFor } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { createCrossTraffic, onRoad } from "./cross-traffic.ts";
import { frameOf, player } from "./race-fixtures.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { crossLightOf, mainLightOf, signalPhaseAt } from "./signals.ts";
import type { SignalledCrossing } from "./signals.ts";
import { BIKE_HALF_WIDTH, TICK_RATE } from "./state.ts";
import type { CrossCar, RaceEvent, RaceState, RiderState } from "./state.ts";

const quiet: Track = {
  ...compileTrack({
    ...roads["breakwater-run"],
    hazardsPerKilometre: 0,
    trafficPerKilometre: 0,
  }),
  walkSites: [],
};

const crossingOf = (id: string): SignalledCrossing => {
  const crossing = quiet.crossings.find((each) => each.id === id);
  if (!crossing?.lights) {
    throw new Error(`Breakwater Run signals ${id}.`);
  }
  return { ...crossing, lights: crossing.lights };
};

const harbour = crossingOf("harbour-cross");
const market = crossingOf("market-cross");

const quietRace = (track = quiet, seed = 7): RaceState => {
  const setup = defaultSetup(track, seed);
  return createRace({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

const quietRaceOn = (track: Track): RaceState => {
  const setup = defaultSetup(track, 3);
  return createRace({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
    police: { ...setup.police, count: 0 },
  });
};

const carsAt = (state: RaceState, junction: number): CrossCar[] =>
  state.crossCars.filter((car) => car.junction === junction);

const junctionOf = (id: string): number =>
  quiet.crossings.findIndex((crossing) => crossing.id === id);

const parkPlayer = (state: RaceState): void => {
  const rider = player(state);
  rider.s = quiet.length - 50;
  rider.bodyS = rider.s;
  rider.x = 2;
  rider.bodyX = 2;
  rider.controller = "human";
};

const stepQuiet = (state: RaceState, track = quiet): void => {
  stepRace(state, track, frameOf(state));
};

describe("cross-road cars at a signalled junction", () => {
  it("drive across on their green, stop short of the road on their red, and queue behind each other", () => {
    const state = quietRace();
    parkPlayer(state);
    const cars = carsAt(state, junctionOf(harbour.id));
    const halfRoad = roadHalfWidthAt(quiet, 0);
    let crossedOnGreen = 0;
    let onRoadOnMainGreen = 0;
    let closest = Number.POSITIVE_INFINITY;
    let queuedAtRed = 0;
    for (let tick = 0; tick < 300 * TICK_RATE; tick += 1) {
      stepQuiet(state);
      const phase = signalPhaseAt(harbour, state.tick);
      for (const car of cars) {
        const inRoad =
          onRoad(car) && Math.abs(car.x) < halfRoad + car.halfWidth - 2;
        if (inRoad && crossLightOf(phase) === "green") {
          crossedOnGreen += 1;
        }
        if (inRoad && mainLightOf(phase) === "green") {
          onRoadOnMainGreen += 1;
        }
        if (
          onRoad(car) &&
          car.pace < 0.5 &&
          crossLightOf(phase) === "red" &&
          Math.abs(car.x) > halfRoad + 1.2
        ) {
          queuedAtRed += 1;
        }
        for (const other of cars) {
          if (
            onRoad(car) &&
            other !== car &&
            other.laneS === car.laneS &&
            onRoad(other)
          ) {
            closest = Math.min(
              closest,
              Math.abs(other.x - car.x) - other.halfWidth - car.halfWidth
            );
          }
        }
      }
    }
    expect({
      crossedOnGreen: crossedOnGreen > 0,
      neverOverlap: closest > 0,
      onRoadOnMainGreen,
      queuedAtRed: queuedAtRed > 0,
    }).toStrictEqual({
      crossedOnGreen: true,
      neverOverlap: true,
      onRoadOnMainGreen: 0,
      queuedAtRed: true,
    });
  });

  it("keep the lane on their own right, the way the arms are painted", () => {
    const state = quietRace();
    for (const car of carsAt(state, junctionOf(harbour.id))) {
      expect(Math.sign(car.laneS - harbour.s)).toBe(Math.sign(car.fromX));
    }
  });
});

describe("cross-road cars at a T", () => {
  it("turn out onto a main-road lane and are gone only once nobody is riding up behind them", () => {
    const state = quietRace();
    parkPlayer(state);
    const cars = carsAt(state, junctionOf(market.id));
    const lanes = [...quiet.sameWayLanes, ...quiet.oncomingLanes];
    let turned = 0;
    let left = 0;
    let offLane = 0;
    let slowest = Number.POSITIVE_INFINITY;
    const wasOn = cars.map(() => false);
    for (let tick = 0; tick < 300 * TICK_RATE; tick += 1) {
      stepQuiet(state);
      for (const [place, car] of cars.entries()) {
        if (onRoad(car) && car.travel > car.turnAt) {
          turned += 1;
          offLane = Math.max(
            offLane,
            Math.min(...lanes.map((lane) => Math.abs(lane - car.x)))
          );
          slowest = Math.min(slowest, Math.abs(car.speed));
        }
        if (wasOn[place] === true && !onRoad(car)) {
          left += 1;
        }
        wasOn[place] = onRoad(car);
      }
    }
    expect(turned).toBeGreaterThan(0);
    expect(offLane).toBeLessThan(1e-9);
    expect(slowest).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0);
  });

  it("keeps a turned car on the road while a rider is close behind it", () => {
    const state = quietRace();
    parkPlayer(state);
    const cars = carsAt(state, junctionOf(market.id));
    let car: CrossCar | undefined;
    while (!car) {
      stepQuiet(state);
      car = cars.find(
        (each) => onRoad(each) && each.travel > each.turnAt && each.along === 1
      );
    }
    while (car.travel - car.turnAt < 150) {
      stepQuiet(state);
    }
    const rider = player(state);
    rider.s = car.s - 100;
    rider.bodyS = rider.s;
    const watched = car;
    for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
      stepQuiet(state);
      rider.s = watched.s - 100;
      rider.bodyS = rider.s;
      rider.speed = 0;
    }
    expect(watched.travel - watched.turnAt).toBeGreaterThan(200);
    expect(onRoad(watched)).toBeTruthy();
    rider.s = watched.s + 100;
    rider.bodyS = rider.s;
    stepQuiet(state);
    expect(onRoad(watched)).toBeFalsy();
  });
});

describe("a car turning onto a road of districts", () => {
  const widths = { shoulderWidth: 0.9, vergeWidth: 7 };
  const road = compileTrack({
    ...roads["breakwater-run"],
    carriers: [],
    chevrons: [],
    crossings: [
      {
        id: "between-squeezes",
        lights: null,
        road: {
          arms: "left",
          carsPerMinute: 6,
          laneWidth: 3.4,
          lanesEachWay: 1,
        },
        s: 1500,
        walk: "unmarked",
      },
    ],
    crowds: [],
    districts: [
      { ...widths, from: 0, lanesEachWay: 1 },
      { ...widths, from: 800, lanesEachWay: 3 },
      { ...widths, from: 2000, lanesEachWay: 1 },
    ],
    pieces: eased([[3000, 0, 0]]),
  });

  it("picks a lane that stays on the road however far a following rider keeps it running", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const car of createCrossTraffic(road, seed)) {
        seen.add(car.along);
        const exitX = Math.abs(car.fromX + car.across * car.turnAt);
        const end = car.along === 1 ? road.endS : road.startS;
        for (
          let s = car.laneS;
          s * car.along <= end * car.along;
          s += car.along
        ) {
          expect(exitX + car.bodyHalfWidth, `at ${s} m`).toBeLessThanOrEqual(
            roadHalfWidthAt(road, s)
          );
        }
      }
    }
    expect(seen).toStrictEqual(new Set([-1, 1]));
  });
});

describe("a give-way side road", () => {
  const road = compileTrack({
    ...roads["breakwater-run"],
    carriers: [],
    chevrons: [],
    crossings: [
      {
        id: "esplanade-cross",
        lights: null,
        road: {
          arms: "left",
          carsPerMinute: 6,
          laneWidth: 3.4,
          lanesEachWay: 1,
        },
        s: 1500,
        walk: "unmarked",
      },
    ],
    crowds: [],
    districts: [
      { from: 0, lanesEachWay: 2, shoulderWidth: 0.9, vergeWidth: 7 },
    ],
    pieces: eased([[3000, 0, 0]]),
  });
  const [esplanade] = road.crossings;

  it("sends a car out only into a gap in the main-road cars it has to cross", () => {
    if (!esplanade) {
      throw new Error("The give-way road has its crossing.");
    }
    const state = quietRace(road);
    const cars = carsAt(state, road.crossings.indexOf(esplanade));
    const rider = player(state);
    rider.controller = "human";
    let entered = 0;
    let waited = 0;
    let soonest = Number.POSITIVE_INFINITY;
    const beyond = cars.map(() => false);
    for (let tick = 0; tick < 240 * TICK_RATE; tick += 1) {
      rider.s = road.length - 50;
      rider.bodyS = rider.s;
      stepRace(state, road, frameOf(state));
      for (const [place, car] of cars.entries()) {
        const past = onRoad(car) && car.travel > car.stopAt + 1;
        if (past && beyond[place] !== true) {
          entered += 1;
          const exitX = car.fromX + car.across * car.turnAt;
          for (const main of state.cars) {
            const inPath =
              Math.abs(main.x - exitX) < 1.5 ||
              (main.x - car.x) * (main.x - exitX) < 0;
            const toBox = (esplanade.s - main.s) * Math.sign(main.cruiseSpeed);
            if (inPath && toBox > 0) {
              soonest = Math.min(soonest, toBox / Math.abs(main.speed));
            }
          }
        }
        beyond[place] = past;
        if (onRoad(car) && car.pace < 0.5) {
          waited += 1;
        }
      }
    }
    expect({
      entered: entered > 0,
      roomToClear: soonest > 3,
      waited: waited > 0,
    }).toStrictEqual({ entered: true, roomToClear: true, waited: true });
  });
});

const CROSS_GREEN = 760;

const crossCarHeadingLeft = (state: RaceState): CrossCar => {
  const car = state.crossCars.find(
    (each) => each.junction === junctionOf(harbour.id) && each.across === -1
  );
  if (!car) {
    throw new Error("Harbour Cross has a car heading left.");
  }
  return car;
};

const launch = (
  state: RaceState,
  car: CrossCar,
  x: number,
  pace: number
): void => {
  for (const each of state.crossCars) {
    each.wait = 1_000_000;
  }
  car.wait = 0;
  car.pace = pace;
  car.travel = (x - car.fromX) * car.across;
};

const eventsOf = (
  state: RaceState,
  kinds: readonly RaceEvent["kind"][]
): RaceEvent["kind"][] =>
  state.events
    .filter((event) => kinds.includes(event.kind))
    .map(({ kind }) => kind);

const rideInto = (x: number, speed: number) => {
  const state = quietRace();
  const rider = player(state);
  rider.controller = "human";
  const car = crossCarHeadingLeft(state);
  launch(state, car, 2, 0);
  rider.s = car.laneS - 10;
  rider.bodyS = rider.s;
  rider.x = x;
  rider.bodyX = x;
  rider.speed = speed;
  const seen: string[] = [];
  for (let tick = 0; tick < 40; tick += 1) {
    stepRace(
      state,
      quiet,
      frameOf(state, [rider.id, { ...neutralInput, throttle: 1 }])
    );
    seen.push(...eventsOf(state, ["crash", "glance", "nearMiss", "bump"]));
  }
  return { car, rider, seen };
};

const nose = (state: RaceState): number =>
  crossCarHeadingLeft(state).bodyHalfLength + BIKE_HALF_WIDTH;

describe("a rider and a cross-road car", () => {
  it("throws the rider on a square hit above crash speed", () => {
    const { rider, seen } = rideInto(2, 40);
    expect(seen).toContain("crash");
    expect(rider.mode).not.toBe("riding");
  });

  it("glances off when the bike only clips the end of the car", () => {
    const { rider, seen } = rideInto(2 - nose(quietRace()) + 0.2, 40);
    expect(seen).toContain("glance");
    expect(seen).not.toContain("crash");
    expect(rider.mode).toBe("riding");
  });

  it("calls a near miss past the end of the car", () => {
    const { rider, seen } = rideInto(2 + nose(quietRace()) + 0.5, 40);
    expect(seen).toContain("nearMiss");
    expect(seen).not.toContain("crash");
    expect(rider.mode).toBe("riding");
  });

  it("is thrown when the moving car's nose reaches a bike already across its lane", () => {
    const state = quietRace();
    state.tick = CROSS_GREEN;
    const rider = player(state);
    rider.controller = "human";
    const car = crossCarHeadingLeft(state);
    launch(state, car, 2 + car.bodyHalfLength + BIKE_HALF_WIDTH + 0.5, 14);
    rider.s = car.laneS - 1;
    rider.bodyS = rider.s;
    rider.x = 2;
    rider.bodyX = 2;
    rider.speed = 2;
    const seen: string[] = [];
    for (let tick = 0; tick < 12; tick += 1) {
      stepRace(state, quiet, frameOf(state));
      seen.push(...eventsOf(state, ["crash"]));
    }
    expect(seen).toContain("crash");
  });
});

const onCollision = (rider: RiderState, car: CrossCar, pace: number): number =>
  rider.x + pace * ((car.laneS - rider.s - 2) / rider.speed);

const rideUntilPast = (
  state: RaceState,
  track: Track,
  car: CrossCar
): number => {
  const rider = player(state);
  let slowest = rider.speed;
  while (rider.mode === "riding" && rider.s < car.laneS + 5) {
    stepRace(state, track, frameOf(state));
    slowest = Math.min(slowest, rider.speed);
  }
  return slowest;
};

const crashesWith = (track: Track): number => {
  const state = quietRaceOn(track);
  let crashes = 0;
  for (let tick = 0; tick < 150 * TICK_RATE; tick += 1) {
    stepRace(state, track, frameOf(state));
    for (const event of state.events) {
      if (event.kind === "crash" && event.cause === "traffic") {
        crashes += 1;
      }
    }
  }
  return crashes;
};

describe("the pilot and cross-road cars", () => {
  const SPEED = 45;
  const METRES = 90;

  const meet = (track = quiet, seed = 7) => {
    const state = quietRace(track, seed);
    state.tick = CROSS_GREEN;
    const rider = player(state);
    rider.s = crossCarHeadingLeft(state).laneS - METRES;
    rider.bodyS = rider.s;
    [rider.x = 0] = track.sameWayLanes;
    rider.bodyX = rider.x;
    rider.speed = SPEED;
    return { rider, state };
  };

  it("takes a line round a car crossing its lane when one is open, keeping its speed", () => {
    const { rider, state } = meet();
    const car = crossCarHeadingLeft(state);
    launch(state, car, onCollision(rider, car, car.cruise), car.cruise);
    const from = rider.x;
    const slowest = rideUntilPast(state, quiet, car);
    expect(rider.mode).toBe("riding");
    expect(Math.abs(rider.x - from)).toBeGreaterThan(0.5);
    expect(slowest).toBeGreaterThan(SPEED - 5);
  });

  it("brakes to arrive after the car has cleared when no line is open", () => {
    const narrow: Track = {
      ...compileTrack({
        ...roads["breakwater-run"],
        districts: [
          { ...roads["breakwater-run"].districts[0], lanesEachWay: 1 },
        ],
        hazardsPerKilometre: 0,
        trafficPerKilometre: 0,
      }),
      walkSites: [],
    };
    let seed = 1;
    let chance = meet(narrow, seed);
    while (crossCarHeadingLeft(chance.state).bodyHalfLength < 4) {
      seed += 1;
      chance = meet(narrow, seed);
    }
    const { rider, state } = chance;
    const car = crossCarHeadingLeft(state);
    rider.x = 0.5;
    rider.bodyX = 0.5;
    launch(state, car, onCollision(rider, car, car.cruise), car.cruise);
    const slowest = rideUntilPast(state, narrow, car);
    expect(rider.mode).toBe("riding");
    expect(slowest).toBeLessThan(SPEED - 4);
  });

  it("rides through without braking when braking cannot help", () => {
    const { rider, state } = meet();
    const car = crossCarHeadingLeft(state);
    rider.s = car.laneS - 12;
    rider.bodyS = rider.s;
    launch(state, car, onCollision(rider, car, car.cruise), car.cruise);
    let brake = 0;
    while (rider.mode === "riding" && rider.s < car.laneS + 5) {
      stepRace(state, quiet, frameOf(state));
      brake = Math.max(brake, rider.input.brake);
    }
    expect(brake).toBe(0);
    expect(rider.mode).toBe("thrown");
  });

  it(
    "gets through a whole race on Breakwater Run with cross cars about as often as without them",
    { timeout: 30_000 },
    () => {
      const road = trackFor("breakwater-run");
      const without = compileTrack({
        ...road.plan,
        crossings: road.plan.crossings.map((crossing) => ({
          ...crossing,
          road: crossing.road && { ...crossing.road, carsPerMinute: 0 },
        })),
      });
      expect(crashesWith(road)).toBeLessThanOrEqual(crashesWith(without) + 4);
    }
  );
});

describe("the dice", () => {
  it("leave every other stream alone: cross cars shift nothing else at the start of a race", () => {
    const withCars = createRace(defaultSetup(quiet, 5));
    const noCars = createRace(
      defaultSetup(
        compileTrack({
          ...roads["breakwater-run"],
          crossings: [],
          hazardsPerKilometre: 0,
          trafficPerKilometre: 0,
        }),
        5
      )
    );
    expect(withCars.crossCars.length).toBeGreaterThan(0);
    expect(noCars.crossCars).toHaveLength(0);
    expect(withCars.dice).toBe(noCars.dice);
    expect(withCars.hazardDice).toBe(noCars.hazardDice);
  });

  it("give two races on the same seed the same cross cars, and another seed different ones", () => {
    const first = createRace(defaultSetup(quiet, 5));
    const again = createRace(defaultSetup(quiet, 5));
    const other = createRace(defaultSetup(quiet, 6));
    expect(first.crossCars).toStrictEqual(again.crossCars);
    expect(first.crossCars).not.toStrictEqual(other.crossCars);
  });
});
