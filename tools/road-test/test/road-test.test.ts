import { createRace, defaultSetup } from "@racer/sim/race";
import { PLAYER_RIDER } from "@racer/sim/state";
import type { RaceState, RiderState, TrafficCar } from "@racer/sim/state";
import { eased } from "@racer/track/alignment";
import type { Districts } from "@racer/track/districts";
import { compileTrack } from "@racer/track/track";
import { breakwaterRun } from "@racer/track/tracks/breakwater-run";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { loadPlan } from "../src/main.ts";
import type { RaceResult } from "../src/race.ts";
import { summarize } from "../src/report.ts";
import { createTally, tallyTick, windowsOf } from "../src/tally.ts";
import type { DistrictCounts, RaceCounts } from "../src/tally.ts";

const SPLIT = 1000;
const ROAD_LENGTH = 2000;
const IN_FIRST = 100;
const IN_SECOND = 1500;

const oneLane = { lanesEachWay: 1, shoulderWidth: 0.9, vergeWidth: 7 } as const;
const districts: Districts = [
  { ...oneLane, from: 0 },
  { ...oneLane, from: SPLIT },
];

const track = compileTrack({
  ...breakwaterRun,
  carriers: [],
  chevrons: [],
  crossings: [],
  districts,
  hazardsPerKilometre: 0,
  pieces: eased([[ROAD_LENGTH, 0, 0]]),
  trafficPerKilometre: 0,
});

const windows = windowsOf(districts, track.length);

const parkedRace = (): RaceState => {
  const setup = defaultSetup(track, 1);
  const race = createRace({ ...setup, police: { ...setup.police, count: 0 } });
  let parked = IN_SECOND + 200;
  for (const rider of race.riders) {
    rider.s = parked;
    rider.x = 0;
    rider.speed = 40;
    parked += 40;
  }
  race.cars.length = 0;
  race.hazards.length = 0;
  return race;
};

const twoRiders = (race: RaceState): readonly [RiderState, RiderState] => {
  const player = race.riders.find((rider) => rider.id === PLAYER_RIDER);
  const rival = race.riders.find((rider) => rider.id !== PLAYER_RIDER);
  if (!player || !rival) {
    throw new Error("The race needs a player and a rival.");
  }
  return [player, rival];
};

const car = (s: number, x: number): TrafficCar => ({
  carrier: false,
  cruiseSpeed: 20,
  halfLength: 2.2,
  halfWidth: 0.92,
  height: 1.45,
  home: x,
  paint: 0,
  patience: 0,
  s,
  speed: 20,
  waited: 0,
  x,
});

const first = (counts: RaceCounts): DistrictCounts => {
  const [row] = counts.districts;
  if (!row) {
    throw new Error("The road has districts.");
  }
  return row;
};

describe("a road test tally", () => {
  it("counts a pass where the passer is, as a contact pass after touching", () => {
    const race = parkedRace();
    const [player, rival] = twoRiders(race);
    player.s = IN_FIRST;
    rival.s = IN_FIRST + 1;
    const tally = createTally(race, windows);
    race.tick = 1;
    tallyTick(tally, race, track);
    player.s = IN_FIRST + 2;
    race.tick = 2;
    tallyTick(tally, race, track);
    expect(first(tally.counts).passes).toBe(1);
    expect(first(tally.counts).contactPasses).toBe(1);
  });

  it("files a combat crash under the district the rider is in", () => {
    const race = parkedRace();
    const [player] = twoRiders(race);
    player.s = IN_SECOND;
    const tally = createTally(race, windows);
    race.events.push({
      by: null,
      cause: "combat",
      hazard: null,
      kind: "crash",
      rider: player.id,
      speed: 20,
    });
    tallyTick(tally, race, track);
    expect(tally.counts.causes.combat).toBe(1);
    expect(tally.counts.districts[1]?.combatCrashes).toBe(1);
    expect(first(tally.counts).combatCrashes).toBe(0);
  });

  it("calls a rider stuck behind a car it cannot outrun", () => {
    const race = parkedRace();
    const [player] = twoRiders(race);
    player.s = IN_FIRST;
    player.speed = 25;
    race.cars.push(car(IN_FIRST + 20, 0));
    const tally = createTally(race, windows);
    tallyTick(tally, race, track);
    expect(first(tally.counts).stuckTicks).toBe(1);
    expect(tally.counts.lanes.get(1)?.stuckTicks).toBe(1);
  });

  it("calls a rider held by a rival ahead and boxed when no lane is open", () => {
    const race = parkedRace();
    const [player, rival] = twoRiders(race);
    player.s = IN_FIRST;
    player.speed = 20;
    rival.s = IN_FIRST + 10;
    rival.speed = 20;
    const free = createTally(race, windows);
    tallyTick(free, race, track);
    expect(first(free.counts).heldTicks).toBe(1);
    expect(first(free.counts).boxedTicks).toBe(0);

    const blockers = race.riders.filter(
      (rider) => rider.id !== player.id && rider.id !== rival.id
    );
    let lane = 0;
    for (const blocker of blockers) {
      blocker.s = IN_FIRST + 5;
      blocker.x = track.oncomingLanes[lane] ?? 0;
      lane += 1;
    }
    rival.x = track.sameWayLanes[0] ?? 0;
    player.x = rival.x;
    const boxed = createTally(race, windows);
    tallyTick(boxed, race, track);
    expect(first(boxed.counts).boxedTicks).toBe(1);
  });

  it("counts two cars that overlap once per meeting", () => {
    const race = parkedRace();
    const behind = car(IN_FIRST, 0);
    race.cars.push(behind, car(IN_FIRST + 3, 0));
    const tally = createTally(race, windows);
    for (const tick of [1, 2, 3]) {
      race.tick = tick;
      tallyTick(tally, race, track);
    }
    expect(tally.counts.carOverlaps).toBe(1);
    behind.s = IN_FIRST - 10;
    race.tick = 4;
    tallyTick(tally, race, track);
    behind.s = IN_FIRST;
    race.tick = 5;
    tallyTick(tally, race, track);
    expect(tally.counts.carOverlaps).toBe(2);
  });
});

const raceResult = (
  seed: number,
  stuckTicks: number,
  liveTicks: number,
  passes: number
): RaceResult => ({
  counts: {
    carOverlaps: 2,
    causes: {
      combat: 1,
      hazard: 0,
      landing: 0,
      offTrack: 0,
      prop: 0,
      rider: 0,
      traffic: 0,
    },
    districts: [
      {
        attacks: 0,
        boxedTicks: 60,
        combatCrashes: 1,
        contactPasses: 0,
        heldTicks: 120,
        hits: 0,
        liveTicks,
        passes,
        reachTicks: 0,
        stuckTicks,
      },
    ],
    lanes: new Map([[1, { liveTicks, stuckTicks }]]),
    liveTicks,
    offRoadTicks: 0,
    stuckTicks,
  },
  crashes: 1,
  finishes: [100, 110, 130],
  riders: 3,
  seed,
});

describe("a road test report", () => {
  it("reports means, the worst seed and rates per kilometre per race", () => {
    const report = summarize(
      1,
      [{ from: 0, to: 2000 }],
      [raceResult(11, 10, 100, 4), raceResult(23, 30, 100, 8)]
    );
    expect(report.overall).toMatchObject({
      carOverlaps: 4,
      carOverlapsPerRace: 2,
      finished: 6,
      firstToLast: 30,
      heldSecsPerRace: 2,
      medianFinish: 110,
      passes: 12,
      stuckByOpenLanes: { 1: 20 },
      stuckMeanPct: 20,
      stuckWorstPct: 30,
      stuckWorstSeed: 23,
    });
    expect(report.districts[0]).toMatchObject({
      boxedSecsPerKm: 0.5,
      heldSecsPerKm: 1,
      passesPerKm: 3,
      stuckPct: 20,
    });
  });
});

describe("a road test plan", () => {
  it("loads a variant plan that exports a TrackPlan as default", async () => {
    const plan = await Effect.runPromise(
      loadPlan(`${import.meta.dirname}/variant-plan.ts`)
    );
    expect(plan.name).toBe("Variant Run");
  });

  it("refuses a module with no plan as its default export", async () => {
    const refusal = await Effect.runPromise(
      Effect.flip(loadPlan(`${import.meta.dirname}/../src/tally.ts`))
    );
    expect(refusal.message).toContain("must export a TrackPlan as default");
  });
});
