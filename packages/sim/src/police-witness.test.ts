import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { cruising, frameOf, onlyCop, player } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { isSignalled, mainLightOf, signalPhaseAt } from "./signals.ts";
import type { LightColour, SignalledCrossing } from "./signals.ts";
import { BIKE_HALF_WIDTH } from "./state.ts";
import type { RaceEvent, RaceState } from "./state.ts";

const course = compileTrack({
  ...roads["breakwater-run"].plan,
  hazardsPerKilometre: 0,
  trafficPerKilometre: 0,
});

const signalledCrossing = (): SignalledCrossing => {
  const crossing = course.crossings.find(({ id }) => id === "harbour-cross");
  if (!(crossing && isSignalled(crossing))) {
    throw new Error("Breakwater Run has a signalled Harbour Cross.");
  }
  return crossing;
};

const harbour = signalledCrossing();
const LINE = harbour.s - harbour.stopGap;
const POST = 1500;
const STAY_PUT = 100_000;
const BRUSH = BIKE_HALF_WIDTH + 0.2;

const tickShowing = (colour: LightColour): number => {
  let tick = 0;
  while (mainLightOf(signalPhaseAt(harbour, tick + 30)) !== colour) {
    tick += 1;
  }
  while (
    mainLightOf(signalPhaseAt(harbour, tick)) !== colour ||
    mainLightOf(signalPhaseAt(harbour, tick + 60)) !== colour
  ) {
    tick += 1;
  }
  return tick;
};

interface Ride {
  readonly state: RaceState;
  readonly pursuits: RaceEvent[];
}

const raceAt = (rivals: number): RaceState => {
  const setup = defaultSetup(course, 1);
  const state = createRace({
    ...setup,
    rivals: setup.rivals.slice(0, rivals),
  });
  for (const pedestrian of state.pedestrians) {
    pedestrian.wait = STAY_PUT;
  }
  for (const rider of state.riders) {
    if (rider.profile.role === "racer") {
      rider.s = 40;
    }
  }
  return state;
};

const ride = (state: RaceState, colour: LightColour, ticks = 60): Ride => {
  const me = player(state);
  me.s = LINE - 5;
  me.bodyS = me.s;
  me.x = -1.8;
  me.speed = 40;
  state.tick = tickShowing(colour);
  const pursuits: RaceEvent[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    stepRace(state, course, frameOf(state, [me.id, cruising]));
    pursuits.push(...state.events.filter((event) => event.kind === "pursuit"));
  }
  return { pursuits, state };
};

const hitAt = (offset: number) => {
  const state = raceAt(0);
  const me = player(state);
  const [walker] = state.pedestrians;
  if (!walker) {
    throw new Error("Breakwater Run has walkers.");
  }
  const cop = onlyCop(state);
  me.s = walker.s - 4;
  me.bodyS = me.s;
  me.x = -1.8;
  me.speed = 30;
  cop.s = me.s - 100;
  cop.post = cop.s;
  walker.x = me.x + offset;
  for (let tick = 0; tick < 20; tick += 1) {
    stepRace(state, course, frameOf(state, [me.id, cruising]));
  }
  return { cop: onlyCop(state), me, walker };
};

describe("a cop who sees an offence", () => {
  it("wakes a parked cop up the road when a rider runs a red, and not when the light is green", () => {
    const seen = raceAt(0);
    const { pursuits } = ride(seen, "red");
    const cop = onlyCop(seen);
    expect({
      chase: cop.chase,
      parked: cop.parked,
      post: cop.post,
      witnessed: cop.witnessed,
    }).toStrictEqual({
      chase: player(seen).id,
      parked: false,
      post: POST,
      witnessed: player(seen).id,
    });
    expect(pursuits).toStrictEqual([
      { kind: "pursuit", rider: cop.id, target: player(seen).id },
    ]);

    const legal = raceAt(0);
    const quiet = ride(legal, "green");
    expect(onlyCop(legal)).toMatchObject({
      chase: null,
      parked: true,
      witnessed: null,
    });
    expect(quiet.pursuits).toHaveLength(0);
  });

  it("sees a red from the far side of the junction but not from 400 m away", () => {
    const ahead = raceAt(0);
    const aheadCop = onlyCop(ahead);
    aheadCop.s = LINE + 200;
    aheadCop.post = aheadCop.s;
    ride(ahead, "red", 20);
    expect(aheadCop.chase).toBe(player(ahead).id);

    const far = raceAt(0);
    const farCop = onlyCop(far);
    farCop.s = LINE - 400;
    farCop.post = farCop.s;
    ride(far, "red", 20);
    expect(farCop).toMatchObject({ chase: null, parked: true });
  });

  it("leaves a rider it is chasing to go after the one it saw run the light", () => {
    const state = raceAt(1);
    const cop = onlyCop(state);
    const rival = state.riders.find(
      (rider) => rider.profile.role === "racer" && rider !== player(state)
    );
    if (!rival) {
      throw new Error("The race has a rival.");
    }
    rival.s = cop.s + 20;
    rival.bodyS = rival.s;
    rival.speed = 30;
    cop.parked = false;
    cop.chase = rival.id;
    ride(state, "red", 20);
    expect(cop.chase).toBe(player(state).id);
  });

  it("holds the chase past the normal 120 m, then lets go at 500 m", () => {
    const state = raceAt(0);
    const cop = onlyCop(state);
    ride(state, "red", 20);
    const me = player(state);
    me.s = cop.s + 400;
    stepRace(state, course, frameOf(state, [me.id, cruising]));
    expect(cop.chase).toBe(me.id);
    me.s = cop.s + 510;
    stepRace(state, course, frameOf(state, [me.id, cruising]));
    expect(cop).toMatchObject({ chase: null, witnessed: null });
  });

  it("stays on the first offender when a second runs the light behind them", () => {
    const state = raceAt(1);
    const cop = onlyCop(state);
    const me = player(state);
    const second = state.riders.find(
      (rider) => rider.profile.role === "racer" && rider !== me
    );
    if (!second) {
      throw new Error("The race has a rival.");
    }
    ride(state, "red", 20);
    second.s = LINE - 1;
    second.bodyS = second.s;
    second.speed = 40;
    for (let tick = 0; tick < 15; tick += 1) {
      stepRace(state, course, frameOf(state, [me.id, cruising]));
    }
    expect(second.s).toBeGreaterThan(LINE);
    expect(cop.chase).toBe(me.id);
  });

  it("drops the offender at the end of its beat and does not come back when they fall", () => {
    const state = raceAt(0);
    const cop = onlyCop(state);
    const me = player(state);
    ride(state, "red", 20);
    expect(cop.chase).toBe(me.id);
    cop.post = cop.s - state.police.beat - 1;
    stepRace(state, course, frameOf(state, [me.id, cruising]));
    expect(cop).toMatchObject({ chase: null, witnessed: null });
    me.s = cop.s + 100;
    me.bodyS = me.s;
    me.mode = "lying";
    stepRace(state, course, frameOf(state, [me.id, cruising]));
    expect(cop).toMatchObject({ chase: null, witnessed: null });
  });

  it("finishes the job on an offender who falls as the beat runs out", () => {
    const state = raceAt(0);
    const cop = onlyCop(state);
    const me = player(state);
    ride(state, "red", 20);
    me.mode = "lying";
    me.bodyS = cop.s + 100;
    cop.post = cop.s - state.police.beat - 1;
    stepRace(state, course, frameOf(state, [me.id, cruising]));
    expect(cop).toMatchObject({ chase: me.id, witnessed: me.id });
  });

  it("does nothing for a cop past the end of its beat", () => {
    const state = raceAt(0);
    const cop = onlyCop(state);
    cop.parked = false;
    cop.post = cop.s - state.police.beat - 1;
    ride(state, "red", 20);
    expect(cop).toMatchObject({ chase: null, witnessed: null });
  });

  it("chases a rider who knocks a walker down, and not one who only brushes past", () => {
    const square = hitAt(0);
    expect(square.walker.mode).toBe("down");
    expect(square.cop.witnessed).toBe(square.me.id);

    const brush = hitAt(BRUSH);
    expect(brush.walker.mode).toBe("flinching");
    expect(brush.cop.witnessed).toBeNull();
  });
});
