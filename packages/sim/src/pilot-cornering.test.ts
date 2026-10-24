import { eased } from "@racer/track/alignment";
import type { TrackPieces } from "@racer/track/alignment";
import { compileTrack, curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { streetBike } from "./bikes.ts";
import { topSpeedOf } from "./engine.ts";
import {
  HERMITS_BEND_FROM,
  HERMITS_BEND_TO,
  KMH,
  field,
  frameOf,
  placedAt,
  player,
  quietTrack,
  rivalNamed,
  straight,
} from "./race-fixtures.ts";
import type { Placement } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { curvePushOf, lateralSpeedLimit, TICK_RATE } from "./state.ts";
import type { BikeSpec, PacingRules, RaceEvent, RaceState } from "./state.ts";

const holdingKmh = (bike: BikeSpec, course: Track, s: number): number => {
  const bend = Math.abs(curvatureAt(course, s));
  let slow = 0;
  let fast = 100;
  for (let step = 0; step < 40; step += 1) {
    const middle = (slow + fast) / 2;
    if (
      (bend * middle * middle) / bike.curvePush >
      lateralSpeedLimit(bike, middle)
    ) {
      fast = middle;
    } else {
      slow = middle;
    }
  }
  return slow * KMH;
};

interface PilotTrace {
  readonly s: number;
  readonly kmh: number;
  readonly brake: number;
  readonly throttle: number;
  readonly offRoad: boolean;
  readonly x: number;
}

const pilotTrace = (
  course: Track,
  bike: BikeSpec,
  skill: number,
  until: number
): PilotTrace[] => {
  const setup = defaultSetup(course, 1);
  const state = createRace({
    ...setup,
    player: { ...setup.player, bike, controller: "pilot", skill },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
  const rider = player(state);
  const trace: PilotTrace[] = [];
  while (rider.s < until && rider.mode === "riding") {
    stepRace(state, course, frameOf(state));
    trace.push({
      brake: rider.input.brake,
      kmh: rider.speed * KMH,
      offRoad: rider.offRoad,
      s: rider.s,
      throttle: rider.input.throttle,
      x: rider.x,
    });
  }
  return trace;
};

const HERMITS_APEX = 6114;

const LONG_SWEEPER_FROM = 6680;

const LONG_SWEEPER_TO = 6940;

const LONG_SWEEPER_APEX = 6758;

const LANE_LINE = 1.8;

const LINE_SLACK = 0.5;

describe("the pilot in bends", () => {
  it.each([
    { least: 0.92, skill: 0.8 },
    { least: 0.95, skill: 0.9 },
    { least: 0.97, skill: 1 },
  ])(
    "a rival of skill $skill on the Sesta brakes late for Hermit's Bend, holds its lane line, takes its apex at $least of the speed the bike can hold or better, and is back on the throttle before the bend ends",
    ({ least, skill }) => {
      const limit = holdingKmh(streetBike, quietTrack, HERMITS_APEX);
      const trace = pilotTrace(quietTrack, streetBike, skill, HERMITS_BEND_TO);
      const approach = trace.filter(
        (step) => step.s > HERMITS_BEND_FROM - 300 && step.s < HERMITS_APEX
      );
      const firstBrake = approach.find((step) => step.brake > 0);
      const apex = trace.find((step) => step.s >= HERMITS_APEX);
      const exit = trace.filter((step) => step.s > HERMITS_APEX);
      if (!(firstBrake && apex)) {
        throw new Error("The pilot never braked for Hermit's Bend.");
      }
      const latest =
        HERMITS_APEX -
        ((firstBrake.kmh / KMH) ** 2 - (limit / KMH) ** 2) /
          (2 * streetBike.brakeDeceleration);
      expect({
        arrivedFast: firstBrake.kmh > 200,
        brakedLate: firstBrake.s > latest - 25,
        heldItsLine: approach.every(
          (step) => Math.abs(step.x - LANE_LINE) < LINE_SLACK
        ),
        openedUp: exit.some((step) => step.throttle === 1),
        stayedOnRoad: trace.every((step) => !step.offRoad),
      }).toStrictEqual({
        arrivedFast: true,
        brakedLate: true,
        heldItsLine: true,
        openedUp: true,
        stayedOnRoad: true,
      });
      expect(apex.kmh / limit).toBeGreaterThanOrEqual(least);
      expect(apex.kmh / limit).toBeLessThanOrEqual(1);
    }
  );

  it("the Sesta takes the long sweeper after Hermit's Bend flat out on its lane line, with no brake and above 92% of the speed it can hold at the tightest point", () => {
    const limit = holdingKmh(streetBike, quietTrack, LONG_SWEEPER_APEX);
    const trace = pilotTrace(quietTrack, streetBike, 0.9, LONG_SWEEPER_TO);
    const sweep = trace.filter((step) => step.s > LONG_SWEEPER_FROM);
    const apex = sweep.find((step) => step.s >= LONG_SWEEPER_APEX);
    expect(limit).toBeGreaterThan(220);
    expect({
      flatOut: sweep.every((step) => step.throttle === 1 && step.brake === 0),
      heldItsLine: sweep.every(
        (step) => Math.abs(step.x - LANE_LINE) < LINE_SLACK
      ),
    }).toStrictEqual({ flatOut: true, heldItsLine: true });
    expect(sweep[0]?.kmh).toBeGreaterThan(210);
    expect((apex?.kmh ?? 0) / limit).toBeGreaterThan(0.92);
  });
});

const pacedPair = (
  course: Track,
  pacing: PacingRules,
  skill?: number
): RaceState => {
  const setup = defaultSetup(course, 1);
  return createRace({
    ...setup,
    pacing,
    police: { ...setup.police, count: 0 },
    rivals: setup.rivals
      .slice(0, 1)
      .map((rival) => ({ ...rival, skill: skill ?? rival.skill })),
  });
};

const rideTheRival = (
  state: RaceState,
  course: Track,
  seconds: number
): number => {
  const rival = rivalNamed(state, "dee-santangelo");
  let fastest = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, course, frameOf(state));
    fastest = Math.max(fastest, rival.speed);
  }
  return fastest;
};

const MIDDLING_SKILL = 0.8;

describe("pacing by the gap to the player", () => {
  it("a rival well clear of the player rolls off to the level's share of its top speed, and rides flat out once the player is out", () => {
    const easing: PacingRules = { catchUp: 0, leadEase: 0.2 };
    const free: PacingRules = { catchUp: 0, leadEase: 0 };
    const [paced, unpaced, playerOut] = [easing, free, easing].map((pacing) => {
      const state = pacedPair(straight, pacing);
      rivalNamed(state, "dee-santangelo").s = 400;
      return state;
    });
    if (!(paced && unpaced && playerOut)) {
      throw new Error("The pacing races were not made.");
    }
    player(playerOut).mode = "busted";
    const top = topSpeedOf(rivalNamed(paced, "dee-santangelo").bike);
    const bustedShare = rideTheRival(playerOut, straight, 40) / top;
    const freeShare = rideTheRival(unpaced, straight, 40) / top;
    const pacedShare = rideTheRival(paced, straight, 40) / top;
    expect(bustedShare).toBeCloseTo(1, 1);
    expect(freeShare).toBeCloseTo(1, 1);
    expect(pacedShare).toBeCloseTo(0.82, 1);
  });

  it("a middling rival dropped behind the player takes the bends harder and brakes later, but never beats its bike's top speed", () => {
    const helped: PacingRules = { catchUp: 0.1, leadEase: 0 };
    const unhelped: PacingRules = { catchUp: 0, leadEase: 0 };
    const [onBends, onBendsAlone, onStraight] = [
      pacedPair(quietTrack, helped, MIDDLING_SKILL),
      pacedPair(quietTrack, unhelped, MIDDLING_SKILL),
      pacedPair(straight, helped, MIDDLING_SKILL),
    ];
    for (const state of [onBends, onBendsAlone, onStraight]) {
      player(state).s = 2000;
    }
    rideTheRival(onBends, quietTrack, 60);
    rideTheRival(onBendsAlone, quietTrack, 60);
    const fastest = rideTheRival(onStraight, straight, 40);
    expect(rivalNamed(onBends, "dee-santangelo").s).toBeGreaterThan(
      rivalNamed(onBendsAlone, "dee-santangelo").s + 20
    );
    expect(fastest).toBeLessThanOrEqual(
      topSpeedOf(rivalNamed(onStraight, "dee-santangelo").bike, true) * 1.01
    );
  });
});

const planningRoad = (pieces: TrackPieces): Track =>
  compileTrack({
    ...ridgeRoad,
    features: [],
    hazardsPerKilometre: 0,
    pieces,
    trafficPerKilometre: 0,
  });

const bendAfter = (
  straightFor: number,
  degrees: number,
  length: number
): TrackPieces =>
  eased([
    [straightFor, 0, 0],
    [length, degrees, 0],
    [3000, 0, 0],
  ]);

interface PlannedStep {
  readonly brake: number;
  readonly s: number;
  readonly share: number;
}

const ridePlanned = (
  road: Track,
  from: Placement,
  seconds: number,
  cars: RaceState["cars"] = []
) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = from.s;
  rider.x = from.x;
  rider.speed = from.speed;
  state.cars.push(...cars);
  rider.controller = "pilot";
  const events: RaceEvent[] = [];
  const steps: PlannedStep[] = [];
  let offRoad = false;
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, road, frameOf(state));
    events.push(...state.events);
    offRoad ||= rider.offRoad;
    steps.push({
      brake: rider.input.brake,
      s: rider.s,
      share:
        Math.abs(
          curvePushOf(rider.bike, curvatureAt(road, rider.s), rider.speed)
        ) / lateralSpeedLimit(rider.bike, rider.speed),
    });
  }
  return { events, offRoad, steps };
};

const kindsOf = (events: readonly RaceEvent[]): string[] =>
  events.map((event) => event.kind);

const steadyBendRoad = (curvature: number): Track => {
  const probe = planningRoad(bendAfter(500, -600, 1500));
  const degrees = (-600 * curvature) / Math.abs(curvatureAt(probe, 1250));
  return planningRoad(bendAfter(500, degrees, 1500));
};

const downhillRoad = (): Track => {
  const flat = planningRoad(bendAfter(600, -60, 200));
  return {
    ...flat,
    slope: new Float64Array(flat.slope.length).fill(-0.1),
    slopeRate: new Float64Array(flat.slopeRate.length),
    worldY: Float64Array.from(flat.worldY, (_, index) => -0.1 * index),
  };
};

const kerbRamp = {
  kind: "jump",
  length: 16,
  rise: 0.8,
  width: 1.4,
} as const;

describe("the pilot plans its speed along the road", () => {
  it("takes a ramp 50 m before a bend at a speed it can land and hold, instead of planning to brake in the air", () => {
    const road = compileTrack({
      ...ridgeRoad,
      features: [
        {
          feature: kerbRamp,
          fromLevel: 1,
          id: "kerb-ramp",
          placement: "fixed",
          s: 500,
          x: 0,
        },
      ],
      hazardsPerKilometre: 0,
      pieces: bendAfter(550, -60, 200),
      trafficPerKilometre: 0,
    });
    const run = ridePlanned(
      road,
      { lateralSpeed: 0, s: 250, speed: 250 / KMH, x: 0 },
      8
    );
    expect({
      crashed: kindsOf(run.events).includes("crash"),
      landed: kindsOf(run.events).includes("land"),
      offRoad: run.offRoad,
    }).toStrictEqual({ crashed: false, landed: true, offRoad: false });
  });

  it("brakes for a bend at the foot of a 10% downhill early enough that the bend never pushes harder than the bike can hold", () => {
    const run = ridePlanned(
      downhillRoad(),
      { lateralSpeed: 0, s: 300, speed: 200 / KMH, x: 1.8 },
      10
    );
    const hardest = Math.max(...run.steps.map((step) => step.share));
    expect(hardest).toBeGreaterThan(0.9);
    expect(hardest).toBeLessThan(1);
    expect(run.offRoad).toBeFalsy();
  });

  it("holds a long steady bend on the throttle without pumping the brakes", () => {
    const run = ridePlanned(
      steadyBendRoad(0.008),
      { lateralSpeed: 0, s: 300, speed: 150 / KMH, x: 1.8 },
      20
    );
    const before = run.steps.filter((step) => step.s < 1100);
    const switches = before.filter(
      (step, index) =>
        index > 0 && step.brake > 0 !== (before[index - 1]?.brake ?? 0) > 0
    ).length;
    expect(switches).toBeLessThanOrEqual(2);
    expect(Math.max(...before.map((step) => step.share))).toBeGreaterThan(0.9);
  });

  it("rides through a row of rocks across a bend without being thrown", () => {
    const road: Track = {
      ...planningRoad(bendAfter(500, -60, 300)),
      hazards: [-3, -1.5, 0, 1.5, 3].map((x, index) =>
        placedAt("rock", 600, x, `rock-${index}`)
      ),
    };
    const run = ridePlanned(
      road,
      { lateralSpeed: 0, s: 350, speed: 200 / KMH, x: 1.8 },
      8
    );
    expect(kindsOf(run.events)).not.toContain("crash");
  });

  it("slows for a bend beyond a blind crest before it takes off, so it lands at a speed it can hold", () => {
    const road = planningRoad(
      eased([
        [400, 0, 0],
        [120, 0, 15],
        [1, 0, 0],
        [150, -60, 0],
        [3000, 0, 0],
      ])
    );
    const run = ridePlanned(
      road,
      { lateralSpeed: 0, s: 200, speed: 200 / KMH, x: 1.8 },
      12
    );
    expect({
      crashed: kindsOf(run.events).includes("crash"),
      landed: kindsOf(run.events).includes("land"),
      offRoad: run.offRoad,
    }).toStrictEqual({ crashed: false, landed: true, offRoad: false });
  });

  it("dodges an oncoming car while slowing for the rocks and oil on the side it dodges to", () => {
    const road: Track = {
      ...compileTrack({
        ...ridgeRoad,
        features: [],
        hazardsPerKilometre: 0,
        lanesEachWay: 2,
        pieces: eased([[6000, 0, 0]]),
        trafficPerKilometre: 0,
      }),
      hazards: [
        placedAt("rock", 961, 5.4, "outer-rock"),
        placedAt("rock", 993, 1.8, "inner-rock"),
        placedAt("oil", 1019, 1.8, "inner-oil"),
      ],
    };
    const run = ridePlanned(
      road,
      { lateralSpeed: 0, s: 900, speed: 69, x: -1.8 },
      5,
      [
        {
          cruiseSpeed: -17.5,
          halfLength: 2.2,
          halfWidth: 0.92,
          height: 1.45,
          paint: 2,
          s: 961,
          speed: -17.5,
          x: -1.8,
        },
      ]
    );
    expect(kindsOf(run.events)).not.toContain("crash");
  });
});
