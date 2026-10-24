import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import {
  field,
  flatOut,
  frameOf,
  hold,
  loadingRamp,
  player,
  quietSlagRow,
  rampRoad,
  rampRoadPlan,
} from "./race-fixtures.ts";
import type { Placement } from "./race-fixtures.ts";
import { stepRace } from "./race.ts";
import { PLAYER_RIDER, TICK_RATE, lateralSpeedLimit } from "./state.ts";
import type { RaceEvent } from "./state.ts";

const wideRampRoad = compileTrack({ ...rampRoadPlan, lanesEachWay: 2 });

const offCentreRampRoad = compileTrack({
  ...rampRoadPlan,
  features: [{ ...rampRoadPlan.features[0], x: 3.5 }],
});

const jumpFrom = (
  s: number,
  x: number,
  speed: number,
  steering: number,
  road: Track = rampRoad
) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = s;
  rider.x = x;
  rider.speed = speed;
  rider.lateralSpeed = steering * lateralSpeedLimit(rider.bike, speed);
  const events: RaceEvent[] = [];
  let takeoff = -1;
  let touchdown = -1;
  let touchdownX = Number.NaN;
  let speedBefore = 0;
  let speedAfter = 0;
  for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
    const { airborne: flying, speed: pace } = rider;
    stepRace(
      state,
      road,
      frameOf(state, [PLAYER_RIDER, { ...flatOut, steer: Math.sign(steering) }])
    );
    events.push(...state.events);
    if (!flying && rider.airborne && takeoff < 0) {
      takeoff = rider.s;
    }
    if (flying && !rider.airborne) {
      touchdownX = rider.mode === "riding" ? rider.x : rider.bodyX;
    }
    if (state.events.some((event) => event.kind === "land")) {
      touchdown = rider.s;
      speedBefore = pace;
      speedAfter = rider.speed;
    }
  }
  return {
    crashes: events.filter((event) => event.kind === "crash"),
    events,
    flights: events.filter((event) => event.kind === "land"),
    speedAfter,
    speedBefore,
    takeoff,
    touchdown,
    touchdownX,
  };
};

const besideRamp = (
  placement: Placement,
  ticks: number,
  road: Track = rampRoad
) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = placement.s;
  rider.x = placement.x;
  rider.speed = placement.speed;
  rider.lateralSpeed = placement.lateralSpeed;
  rider.airborne = placement.airborne ?? placement.air !== undefined;
  rider.air = placement.air ?? 0;
  rider.verticalSpeed = placement.verticalSpeed ?? 0;
  const steer = placement.steer ?? Math.sign(placement.lateralSpeed);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    stepRace(
      state,
      road,
      frameOf(state, [PLAYER_RIDER, { ...flatOut, steer }])
    );
    events.push(...state.events);
  }
  return { events, rider, state };
};

const dropOnto = (metres: number): RaceEvent[] => {
  const state = field(rampRoad, 1, 0, 0);
  const rider = player(state);
  rider.s = 3000;
  rider.speed = 40;
  rider.airborne = true;
  rider.air = metres;
  return hold(state, rampRoad, flatOut, 2).filter(
    (event) => event.kind === "crash"
  );
};

const overSlagRowHump = (speed: number, throttle: number): RaceEvent[] => {
  const state = field(quietSlagRow, 1, 0, 0);
  const rider = player(state);
  rider.s = 3940;
  rider.speed = speed;
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 4 * TICK_RATE && rider.s < 4300; tick += 1) {
    stepRace(
      state,
      quietSlagRow,
      frameOf(state, [PLAYER_RIDER, { ...flatOut, throttle }])
    );
    events.push(...state.events);
  }
  return events;
};

describe("jumping", () => {
  it("a loading ramp taken flat out at 180 km/h throws the bike about 60 m from the lip and it lands straight and rides on", () => {
    const jump = jumpFrom(900, 0, 50, 0);
    expect(jump.crashes).toHaveLength(0);
    expect(jump.flights).toHaveLength(1);
    expect(Math.abs(jump.takeoff - 1016.5)).toBeLessThan(1);
    expect(Math.abs(jump.touchdown - 1016 - 62)).toBeLessThan(13);
  });

  it("a straight landing costs a little speed, not a lot", () => {
    const jump = jumpFrom(900, 0, 50, 0);
    const kept = jump.speedAfter / jump.speedBefore;
    expect(kept).toBeGreaterThan(0.9);
    expect(kept).toBeLessThan(0.99);
  });

  it("a bike still steering hard when it leaves the lip lands leaned over on the tarmac and crashes; a gentle drift lands", () => {
    const leaned = jumpFrom(1012, -0.2, 50, 0.75, wideRampRoad);
    const drifting = jumpFrom(1012, -0.2, 50, 0.3, wideRampRoad);
    expect(leaned.crashes.map((crash) => crash.cause)).toStrictEqual([
      "landing",
    ]);
    expect(Math.abs(leaned.touchdownX)).toBeLessThan(
      wideRampRoad.roadHalfWidth - 1
    );
    expect(drifting.crashes).toHaveLength(0);
    expect(drifting.flights).toHaveLength(1);
  });

  it("the same gentle drift off a ramp at the road edge lands on the verge and crashes", () => {
    const jump = jumpFrom(2012, 3.8, 50, 0.3);
    expect(jump.crashes.map((crash) => crash.cause)).toStrictEqual(["landing"]);
  });

  it("swerving sharply into the side of a ramp throws the rider", () => {
    const swerve = jumpFrom(1010, 0.9, 40, -0.8);
    expect(swerve.crashes.map((crash) => crash.cause)).toStrictEqual(["prop"]);
  });

  it("brushing the side of a ramp glances off it: the rider stays beside it on the ground and rides on", () => {
    const brush = field(rampRoad, 1, 0, 0);
    const rider = player(brush);
    rider.s = 1010;
    rider.x = 0.75;
    rider.speed = 40;
    rider.lateralSpeed = -0.9;
    const events = hold(brush, rampRoad, { ...flatOut, steer: -0.05 }, 0.12);
    expect(rider.s).toBeLessThan(1016);
    expect(events.map((event) => event.kind)).toContain("glance");
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    expect(rider.x).toBeGreaterThan(0.7);
    expect(rider.airborne).toBeFalsy();
  });

  it("cutting across the side of a ramp just short of its lip hits the side instead of passing through it", () => {
    const cut = besideRamp(
      { lateralSpeed: -4, s: 1015.6, speed: 60, x: 0.72 },
      1
    );
    expect(
      cut.events.map((event) => event.kind === "crash" && event.cause)
    ).toStrictEqual(["prop"]);
  });

  it("cutting in from exactly the edge line of a ramp just short of its lip hits the side, the same as cutting in from beside it", () => {
    const cut = besideRamp(
      { lateralSpeed: -4, s: 1015.6, speed: 60, x: 0.7 },
      1
    );
    expect(
      cut.events.map((event) => event.kind === "crash" && event.cause)
    ).toStrictEqual(["prop"]);
  });

  it("a bike skimming low from exactly the edge line of a ramp glances off its side instead of popping up onto the deck", () => {
    const skim = besideRamp(
      {
        air: 0.1,
        lateralSpeed: -0.8,
        s: 1010,
        speed: 40,
        verticalSpeed: 0,
        x: 0.7,
      },
      3
    );
    expect(skim.events.map((event) => event.kind)).toStrictEqual(["glance"]);
    expect(skim.rider.air).toBeLessThan(0.2);
    expect(skim.rider.x).toBeGreaterThanOrEqual(0.7);
  });

  it("a rider who glances off a ramp from exactly its edge line and lets go of the bars rides on along its side on the ground", () => {
    const brush = besideRamp(
      { lateralSpeed: -0.5, s: 1008, speed: 20, x: 0.7 },
      1
    );
    const events = [
      ...brush.events,
      ...hold(brush.state, rampRoad, flatOut, 0.25),
    ];
    expect(events.map((event) => event.kind)).toStrictEqual(["glance"]);
    expect(brush.rider.s).toBeLessThan(1016);
    expect(brush.rider.air).toBe(0);
    expect(brush.rider.airborne).toBeFalsy();
  });

  it("a rider drifting across a ramp's deck onto its edge line rides on along the deck instead of dropping to the road", () => {
    const drift = besideRamp(
      {
        air: 0.3125,
        airborne: false,
        lateralSpeed: 1 / 6,
        s: 1010,
        speed: 40,
        steer: 0,
        x: 0.7 - 1 / 720,
      },
      2
    );
    const deckHeight =
      loadingRamp.rise * ((drift.rider.s - 1000) / loadingRamp.length) ** 2;
    expect(drift.events).toStrictEqual([]);
    expect(drift.rider.x).toBeCloseTo(0.7, 6);
    expect(drift.rider.air).toBeCloseTo(deckHeight, 6);
  });

  it("a rider riding up a ramp exactly along its edge line leaves the lip the same as one up the middle", () => {
    const deck = { air: 0.7605, airborne: false, s: 1015.6, speed: 60 };
    const edge = besideRamp({ ...deck, lateralSpeed: 0, x: 0.7 }, 1);
    const middle = besideRamp({ ...deck, lateralSpeed: 0, x: 0 }, 1);
    expect(middle.rider.airborne).toBeTruthy();
    expect(edge.rider.airborne).toBeTruthy();
    expect(edge.rider.air).toBe(middle.rider.air);
  });

  it("a rider who steers off the side of a ramp's deck falls from the deck instead of dropping straight to the road", () => {
    const off = besideRamp(
      {
        air: 0.3125,
        airborne: false,
        lateralSpeed: 3,
        s: 1010,
        speed: 40,
        x: 0.69,
      },
      1
    );
    expect(off.rider.x).toBeGreaterThan(0.7);
    expect(off.rider.airborne).toBeTruthy();
    expect(off.rider.air).toBeGreaterThan(0.25);
  });

  it("a rider on the road who steers away from exactly a ramp's edge line stays on the road", () => {
    const away = besideRamp({ lateralSpeed: 2, s: 1010, speed: 40, x: 0.7 }, 3);
    expect(away.events).toStrictEqual([]);
    expect(away.rider.airborne).toBeFalsy();
    expect(away.rider.air).toBe(0);
  });

  it("a bike dropping past a ramp just below its deck, exactly on its edge line, falls on past it instead of being pulled up onto the deck", () => {
    const fall = besideRamp(
      {
        air: 0.25,
        lateralSpeed: 0,
        s: 1010,
        speed: 40,
        verticalSpeed: -10,
        x: 0.7,
      },
      1
    );
    expect(fall.events).toStrictEqual([]);
    expect(fall.rider.airborne).toBeTruthy();
    expect(fall.rider.air).toBeLessThan(0.25);
  });

  it("a bike that comes down onto a ramp's deck hard at the very end of a tick crashes on the deck instead of sinking through it to the road", () => {
    const sink = besideRamp(
      {
        air: 0.47309638888888766,
        lateralSpeed: 0,
        s: 1009.48,
        speed: 40,
        verticalSpeed: -9,
        x: 0,
      },
      6
    );
    expect(
      sink.events.map((event) => event.kind === "crash" && event.cause)
    ).toStrictEqual(["landing"]);
  });

  it("a hard landing on the edge of a ramp off the middle of the road crashes the same as one on a ramp in the middle", () => {
    const alongDeck = 10 / loadingRamp.length;
    const landing = {
      air: loadingRamp.rise * alongDeck * alongDeck,
      lateralSpeed: -0.8,
      s: 1010,
      speed: 40,
      verticalSpeed: -10,
    };
    const centred = besideRamp({ ...landing, x: 0.7 }, 3);
    const offCentre = besideRamp({ ...landing, x: 4.2 }, 3, offCentreRampRoad);
    expect(
      centred.events.map((event) => event.kind === "crash" && event.cause)
    ).toStrictEqual(["landing"]);
    expect(offCentre.events).toStrictEqual(centred.events);
  });

  it("a bike coming down onto a ramp just short of its lip touches down on the deck instead of falling through it", () => {
    const drop = besideRamp(
      {
        air: 0.79,
        lateralSpeed: 0,
        s: 1015.5,
        speed: 60,
        verticalSpeed: -3,
        x: 0,
      },
      1
    );
    expect(drop.events.map((event) => event.kind)).toStrictEqual(["land"]);
  });

  it("a bike skimming low beside a ramp glances off its side instead of popping up onto the deck", () => {
    const skim = besideRamp(
      {
        air: 0.1,
        lateralSpeed: -0.8,
        s: 1010,
        speed: 40,
        verticalSpeed: 0,
        x: 0.71,
      },
      3
    );
    expect(skim.events.map((event) => event.kind)).toStrictEqual(["glance"]);
    expect(skim.rider.air).toBeLessThan(0.2);
    expect(skim.rider.x).toBeGreaterThan(0.7);
  });

  it("a bike that drops eight metres onto the road crashes however straight it lands; a two metre drop is ridden out", () => {
    expect(
      dropOnto(8).map((crash) => crash.kind === "crash" && crash.cause)
    ).toStrictEqual(["landing"]);
    expect(dropOnto(2)).toHaveLength(0);
  });

  it("Slag Row's hump is ridden over on the ground at 130 km/h and gives a short hop flat out", () => {
    const cruise = overSlagRowHump(36, 0.6);
    const flat = overSlagRowHump(53, 1);
    expect(cruise.some((event) => event.kind === "land")).toBeFalsy();
    const hops = flat.filter((event) => event.kind === "land");
    expect(hops).toHaveLength(1);
    expect(hops[0]?.kind === "land" && hops[0].airSeconds).toBeGreaterThan(0.1);
    expect(hops[0]?.kind === "land" && hops[0].airSeconds).toBeLessThan(1);
    expect(flat.some((event) => event.kind === "crash")).toBeFalsy();
  });
});
