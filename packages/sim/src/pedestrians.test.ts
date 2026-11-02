import { roads, trackFor } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { NO_CROSSING } from "@racer/track/walk-sites";
import { describe, expect, it } from "vitest";

import { HAZARD_MISS_SHARE } from "./pilot-crossers.ts";
import { frameOf, player, straight } from "./race-fixtures.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { mainLightOf, signalPhaseAt } from "./signals.ts";
import type { SignalledCrossing } from "./signals.ts";
import { setupDigest } from "./snapshot-setup.ts";
import {
  restoreSnapshot,
  snapshotCapacity,
  writeSnapshot,
} from "./snapshot.ts";
import { lateralSpeedLimit, TICK_RATE } from "./state.ts";
import type { Pedestrian, RaceEvent, RaceState, RiderState } from "./state.ts";

const WALKER_S = 1000;
const LANE_X = 2;
const HELD_UNTIL = 2.5;
const ROCK_THROUGH_FLOOR = 45;

const onStraight: Track = {
  ...straight,
  walkSites: [
    { crossing: NO_CROSSING, id: "walker", kind: "jaywalk", s: WALKER_S },
  ],
};

const raceOn = (road: Track, seed = 3): RaceState => {
  const setup = defaultSetup(road, seed);
  return createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

const walkerOf = (state: RaceState, index = 0): Pedestrian => {
  const walker = state.pedestrians[index];
  if (!walker) {
    throw new Error(`No pedestrian in slot ${index}.`);
  }
  return walker;
};

const placeWalker = (walker: Pedestrian, x: number, drift = 0): void => {
  walker.drift = drift;
  walker.mode = "walking";
  walker.wait = 0;
  walker.x = x;
};

const placeRider = (rider: RiderState, x: number, speed: number): void => {
  rider.bodyS = WALKER_S - 20;
  rider.bodyX = x;
  rider.s = WALKER_S - 20;
  rider.speed = speed;
  rider.x = x;
};

const crossOnFullThrottle = (
  state: RaceState,
  rider: RiderState,
  speed: number,
  lean: number,
  x: number
): RaceEvent[] => {
  const seen: RaceEvent[] = [];
  for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
    if (rider.s < WALKER_S - HELD_UNTIL) {
      rider.speed = speed;
      rider.x = x;
      rider.lateralSpeed = lean * lateralSpeedLimit(rider.bike, speed);
    }
    stepRace(
      state,
      onStraight,
      frameOf(state, [rider.id, { ...neutralInput, throttle: 1 }])
    );
    seen.push(...state.events);
  }
  return seen;
};

const rideInto = (speed: number, lean = 0, x = LANE_X) => {
  const state = raceOn(onStraight);
  const rider = player(state);
  const walker = walkerOf(state);
  placeWalker(walker, LANE_X);
  placeRider(rider, x, speed);
  const seen = crossOnFullThrottle(state, rider, speed, lean, x);
  return { rider, seen, walker };
};

const crashOf = (seen: readonly RaceEvent[]) =>
  seen.find((event) => event.kind === "crash");

const lossOf = (speed: number, seen: readonly RaceEvent[]): number => {
  const hit = seen.find((event) => event.kind === "hazard");
  return hit?.kind === "hazard" ? speed - hit.speed : 0;
};

const effectsOf = (seen: readonly RaceEvent[]): string[] =>
  seen.flatMap((event) => (event.kind === "hazard" ? [event.effect] : []));

describe("a rider who meets a pedestrian", () => {
  it("rides on with a wobble going straight at normal speed", () => {
    const { rider, seen, walker } = rideInto(40);
    expect(effectsOf(seen)).toStrictEqual(["bump"]);
    expect(crashOf(seen)).toBeUndefined();
    expect(rider.mode).toBe("riding");
    expect(walker.mode).not.toBe("waiting");
  });

  it("loses more speed the faster the hit", () => {
    const slow = rideInto(30);
    const fast = rideInto(60);
    expect(lossOf(60, fast.seen) / 60).toBeGreaterThan(
      lossOf(30, slow.seen) / 30
    );
  });

  it("is thrown by the landing when leaned hard, and the crash names the pedestrian", () => {
    const { rider, seen, walker } = rideInto(50, 0.6);
    const crash = crashOf(seen);
    expect(crash?.kind === "crash" && crash.cause).toBe("hazard");
    expect(crash?.kind === "crash" && crash.hazard?.id).toBe(walker.id);
    expect(crash?.kind === "crash" && crash.hazard?.kind).toBe("pedestrian");
    expect(rider.mode).not.toBe("riding");
  });

  it("is thrown straight only when very fast", () => {
    expect(crashOf(rideInto(60).seen)).toBeUndefined();
    expect(crashOf(rideInto(75).seen)).toBeDefined();
  });

  it("holds on at the same lean when slower", () => {
    expect(crashOf(rideInto(50, 0.5).seen)).toBeDefined();
    expect(crashOf(rideInto(30, 0.5).seen)).toBeUndefined();
  });

  it("staggers at low speed and knocks the pedestrian down", () => {
    const { rider, seen, walker } = rideInto(10);
    expect(effectsOf(seen)).toStrictEqual(["stagger"]);
    expect(rider.mode).toBe("riding");
    const hit = seen.find((event) => event.kind === "hazard");
    expect(hit?.kind === "hazard" && hit.speed).toBeLessThan(10);
    expect(walker.wait).toBeGreaterThanOrEqual(0);
  });

  it("makes the pedestrian flinch on a clip and rides on with little lost", () => {
    const state = raceOn(onStraight);
    const rider = player(state);
    const walker = walkerOf(state);
    placeWalker(walker, LANE_X);
    placeRider(rider, LANE_X + walker.halfWidth + 0.3, 40);
    const seen: RaceEvent[] = [];
    while (rider.s < WALKER_S) {
      stepRace(
        state,
        onStraight,
        frameOf(state, [rider.id, { ...neutralInput, throttle: 1 }])
      );
      seen.push(...state.events);
    }
    expect(walker.mode).toBe("flinching");
    expect(crashOf(seen)).toBeUndefined();
    expect(rider.airborne).toBeFalsy();
    expect(rider.speed).toBeGreaterThan(38);
  });

  it("calls a near miss past a walker and takes nothing", () => {
    const { rider, seen, walker } = rideInto(40, 0, LANE_X + 1.1);
    const miss = seen.find((event) => event.kind === "nearMiss");
    expect(miss?.kind === "nearMiss" && miss.hazard?.id).toBe(walker.id);
    expect(effectsOf(seen)).toStrictEqual([]);
    expect(rider.mode).toBe("riding");
  });
});

describe("a pedestrian who is hit", () => {
  it("falls, lies, gets up and walks off to the far kerb", () => {
    const state = raceOn(onStraight);
    const rider = player(state);
    const walker = walkerOf(state);
    placeWalker(walker, LANE_X);
    placeRider(rider, LANE_X, 40);
    const seen = new Set<string>();
    for (let tick = 0; tick < 30 * TICK_RATE; tick += 1) {
      stepRace(state, onStraight, frameOf(state));
      seen.add(walker.mode);
    }
    expect(seen).toContain("down");
    expect(seen).toContain("walking");
    expect(seen).toContain("gone");
  });
});

describe("a pedestrian's own walk", () => {
  it("waits at the kerb, crosses to the far kerb, is gone, and comes back", () => {
    const state = raceOn(onStraight);
    const walker = walkerOf(state);
    const rider = player(state);
    rider.s = straight.length - 50;
    const seen: string[] = [];
    let fromX = Number.NaN;
    let lastX = Number.NaN;
    for (let tick = 0; tick < 120 * TICK_RATE; tick += 1) {
      stepRace(state, onStraight, frameOf(state));
      if (seen.at(-1) !== walker.mode) {
        seen.push(walker.mode);
        fromX = walker.mode === "walking" ? walker.x : fromX;
      }
      lastX = walker.mode === "walking" ? walker.x : lastX;
    }
    expect(seen.slice(0, 4)).toStrictEqual([
      "waiting",
      "walking",
      "gone",
      "waiting",
    ]);
    expect(Math.sign(fromX)).toBe(-Math.sign(lastX));
  });

  it("steps out into a gap in the cars and not in front of one", () => {
    const road: Track = { ...onStraight };
    const state = raceOn(road);
    const walker = walkerOf(state);
    const rider = player(state);
    rider.s = straight.length - 50;
    const car = {
      cruiseSpeed: 20,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 0,
      s: WALKER_S - 90,
      speed: 20,
      x: 2,
    };
    state.cars.push(car);
    walker.wait = 1;
    stepRace(state, road, frameOf(state));
    expect(walker.mode).toBe("waiting");
    car.s = WALKER_S + 30;
    for (let tick = 0; tick < 60; tick += 1) {
      stepRace(state, road, frameOf(state));
    }
    expect(walker.mode).toBe("walking");
  });

  it("crosses a signalled zebra on the main road's red, and only a few go against it", () => {
    const road = compileTrack({
      ...roads["breakwater-run"].plan,
      hazardsPerKilometre: 0,
      trafficPerKilometre: 0,
    });
    const state = raceOn(road, 11);
    player(state).s = road.length - 50;
    let onRed = 0;
    let againstRed = 0;
    const wasWalking = state.pedestrians.map(() => false);
    for (let tick = 0; tick < 240 * TICK_RATE; tick += 1) {
      stepRace(state, road, frameOf(state));
      for (const [index, walker] of state.pedestrians.entries()) {
        const crossing = road.crossings[walker.crossing];
        const walking = walker.mode === "walking";
        if (walking && wasWalking[index] !== true && crossing?.lights) {
          const signalled: SignalledCrossing = {
            ...crossing,
            lights: crossing.lights,
          };
          if (mainLightOf(signalPhaseAt(signalled, state.tick)) === "red") {
            onRed += 1;
          } else {
            againstRed += 1;
          }
        }
        wasWalking[index] = walking;
      }
    }
    expect(onRed).toBeGreaterThan(20);
    expect(againstRed).toBeLessThan(onRed / 4);
  });
});

describe("a car and a pedestrian", () => {
  it("stops short of a pedestrian in its lane and goes on when they have crossed", () => {
    const state = raceOn(onStraight);
    const walker = walkerOf(state);
    const rider = player(state);
    rider.s = straight.length - 50;
    placeWalker(walker, 2);
    walker.mode = "down";
    walker.wait = 15 * TICK_RATE;
    const car = {
      cruiseSpeed: 20,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 0,
      s: WALKER_S - 100,
      speed: 20,
      x: 2,
    };
    state.cars.push(car);
    for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
      stepRace(state, onStraight, frameOf(state));
    }
    expect(car.speed).toBe(0);
    expect(car.s + car.halfLength).toBeLessThan(WALKER_S);
    walker.mode = "gone";
    walker.wait = 60 * TICK_RATE;
    for (let tick = 0; tick < 5 * TICK_RATE; tick += 1) {
      stepRace(state, onStraight, frameOf(state));
    }
    expect(car.speed).toBeGreaterThan(5);
  });
});

const carsOn = (state: RaceState, walker: Pedestrian): boolean =>
  [...state.cars, ...state.crossCars].some(
    (car) =>
      Math.abs(car.speed) > 1 &&
      Math.abs(car.s - walker.s) < car.halfLength + walker.halfLength &&
      Math.abs(car.x - walker.x) < car.halfWidth + walker.halfWidth
  );

describe("a car and a pedestrian who walks into its lane", () => {
  it("stops before the walker reaches the lane and goes on behind them", () => {
    const state = raceOn(onStraight);
    const walker = walkerOf(state);
    player(state).s = straight.length - 50;
    placeWalker(walker, -3, 1.4);
    const car = {
      cruiseSpeed: 20,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 0,
      s: WALKER_S - 40,
      speed: 20,
      x: 2,
    };
    state.cars.push(car);
    let slowest = car.speed;
    for (let tick = 0; tick < 12 * TICK_RATE; tick += 1) {
      stepRace(state, onStraight, frameOf(state));
      slowest = Math.min(slowest, car.speed);
      expect(carsOn(state, walker)).toBeFalsy();
    }
    expect(slowest).toBe(0);
    expect(car.speed).toBeGreaterThan(5);
  });

  it("never drives through one on a road with junctions", () => {
    const road = trackFor("breakwater-run", 5);
    const struck = [1, 8, 11].flatMap((seed) => {
      const state = raceOn(road, seed);
      player(state).speed = 0;
      const seen: string[] = [];
      for (let tick = 0; tick < 60 * TICK_RATE; tick += 1) {
        stepRace(state, road, frameOf(state));
        seen.push(
          ...state.pedestrians
            .filter((walker) => walker.mode === "walking")
            .filter((walker) => carsOn(state, walker))
            .map((walker) => `${seed}/${state.tick}/${walker.id}`)
        );
      }
      return seen;
    });
    expect(struck).toStrictEqual([]);
  });
});

const pilotRace = (skill: number, seed: number): RaceState => {
  const setup = defaultSetup(onStraight, seed);
  return createRace({
    ...setup,
    player: { ...setup.player, controller: "pilot", skill },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

const pilotToward = (state: RaceState) => {
  const rider = player(state);
  const walker = walkerOf(state);
  const metres = 90;
  const speed = 35;
  const drift = 1.4;
  placeWalker(walker, LANE_X - (drift * metres) / speed, drift);
  rider.s = WALKER_S - metres;
  rider.bodyS = rider.s;
  rider.x = LANE_X;
  rider.bodyX = LANE_X;
  rider.speed = speed;
  const seen: RaceEvent[] = [];
  for (
    let tick = 0;
    tick < 5 * TICK_RATE && rider.s < WALKER_S + 5;
    tick += 1
  ) {
    stepRace(state, onStraight, frameOf(state));
    seen.push(...state.events);
  }
  return seen;
};

describe("the pilot and a pedestrian", () => {
  it("steers a skilled rider round a walker", () => {
    expect(effectsOf(pilotToward(pilotRace(1, 3)))).toStrictEqual([]);
  });

  it("holds its speed through a walker it cannot miss", () => {
    const state = pilotRace(1, 3);
    const rider = player(state);
    const walker = walkerOf(state);
    const speed = 55;
    const metres = 22;
    const drift = 1.4;
    placeWalker(walker, LANE_X - (drift * metres) / speed, drift);
    rider.s = WALKER_S - metres;
    rider.bodyS = rider.s;
    rider.x = LANE_X;
    rider.bodyX = LANE_X;
    rider.speed = speed;
    while (rider.s < WALKER_S - 2) {
      stepRace(state, onStraight, frameOf(state));
    }
    expect(rider.speed).toBeGreaterThan(ROCK_THROUGH_FLOOR);
  });

  it("lets an unskilled rider miss some of them, at the rock rate", () => {
    const seeds = Array.from({ length: 60 }, (_, seed) => seed);
    const hits = seeds.filter(
      (seed) => effectsOf(pilotToward(pilotRace(0, seed))).length > 0
    ).length;
    expect(hits / seeds.length).toBeGreaterThan(HAZARD_MISS_SHARE - 0.25);
    expect(hits / seeds.length).toBeLessThan(HAZARD_MISS_SHARE + 0.25);
  });
});

describe("pedestrians in the snapshot", () => {
  it("restore mid-crossing and go on exactly as the original", () => {
    const road = trackFor("breakwater-run", 5);
    const setup = defaultSetup(road, 5);
    const original = createRace(setup);
    for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
      stepRace(original, road, frameOf(original));
    }
    const buffer = new DataView(new ArrayBuffer(snapshotCapacity(original)));
    writeSnapshot(original, setupDigest(original, road), buffer);
    const restored = restoreSnapshot(setup, buffer);
    for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
      stepRace(original, road, frameOf(original));
      stepRace(restored, road, frameOf(restored));
    }
    expect(restored.pedestrians).toStrictEqual(original.pedestrians);
    expect(original.pedestrians.length).toBeGreaterThan(0);
  });
});
