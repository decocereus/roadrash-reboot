import { compileTrack, curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { rivalAt, rivals } from "./cast.ts";
import { pilotInput } from "./pilot.ts";
import { chaserDistance, PATROL_SPEED } from "./police.ts";
import {
  createRace,
  defaultPolice,
  defaultSetup,
  standings,
  stepRace,
  validateSetup,
} from "./race.ts";
import { FULL_CONDITION, MAX_STAMINA, TICK_RATE } from "./state.ts";
import type {
  BikeSpec,
  PoliceSetup,
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderInput,
  RiderState,
  RivalSetup,
  WeaponKind,
} from "./state.ts";
import { arm, disarm } from "./weapons.ts";

const track = compileTrack(ridgeRoad);
const quietTrack = compileTrack({ ...ridgeRoad, trafficPerKilometre: 0 });
const straight = compileTrack({
  ...ridgeRoad,
  sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
  trafficPerKilometre: 0,
});

const field = (
  course: Track,
  seed: number,
  rivalCount: number,
  copCount: number
): RaceState => {
  const setup = defaultSetup(course, seed);
  return createRace({
    ...setup,
    police: { ...setup.police, count: copCount },
    rivals: setup.rivals.slice(0, rivalCount),
  });
};

const cruising: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0.5,
};

const riderAt = (state: RaceState, index: number) => {
  const rider = state.riders[index];
  if (!rider) {
    throw new Error(`The race has no rider ${index}.`);
  }
  return rider;
};

const player = (state: RaceState) => {
  const [rider] = state.riders;
  if (!rider) {
    throw new Error("The race has no rider.");
  }
  return rider;
};

const hold = (
  state: RaceState,
  course: Track,
  input: RiderInput,
  seconds: number
): RaceEvent[] => {
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, course, [input]);
    events.push(...state.events);
  }
  return events;
};

const pilotUntilFinish = (
  state: RaceState,
  course: Track,
  limitSeconds: number
) => {
  const input: RiderInput = {
    brake: 0,
    kick: false,
    punch: false,
    steer: 0,
    throttle: 0,
  };
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < limitSeconds * TICK_RATE; tick += 1) {
    pilotInput(state, course, 0, input);
    stepRace(state, course, [input]);
    events.push(...state.events);
    if (player(state).finishTick >= 0) {
      break;
    }
  }
  return events;
};

const brakeIntoBend = (brake: number) => {
  const state = field(quietTrack, 1, 0, 0);
  const rider = player(state);
  rider.s = 1520;
  rider.speed = 50;
  const input = { brake, kick: false, punch: false, steer: -1, throttle: 0 };
  for (let tick = 0; tick < 6 * TICK_RATE && rider.speed > 30; tick += 1) {
    stepRace(state, quietTrack, [input]);
  }
  return { distance: rider.s - 1520, mode: rider.mode };
};

const brakeAcrossBend = (brake: number): number => {
  const state = field(quietTrack, 1, 0, 0);
  const rider = player(state);
  rider.s = 1560;
  rider.x = -4;
  rider.speed = 50;
  hold(
    state,
    quietTrack,
    { brake, kick: false, punch: false, steer: 1, throttle: 0 },
    0.4
  );
  return rider.speed;
};

describe("riding", () => {
  it("reaches 100 km/h in under five seconds and tops out near 210 km/h", () => {
    const state = field(quietTrack, 1, 0, 0);
    const fullThrottle = {
      brake: 0,
      kick: false,
      punch: false,
      steer: 0,
      throttle: 1,
    };
    hold(state, quietTrack, fullThrottle, 4.5);
    expect(player(state).speed * 3.6).toBeGreaterThan(100);

    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const sprint = field(flat, 1, 0, 0);
    hold(sprint, flat, fullThrottle, 60);
    expect(player(sprint).speed * 3.6).toBeGreaterThan(200);
    expect(player(sprint).speed * 3.6).toBeLessThan(220);
  });

  it("stops from 200 km/h in under 170 metres", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = field(flat, 1, 0, 0);
    const rider = player(state);
    rider.speed = 200 / 3.6;
    const from = rider.s;
    hold(
      state,
      flat,
      { brake: 1, kick: false, punch: false, steer: 0, throttle: 0 },
      8
    );
    expect(rider.speed).toBe(0);
    expect(rider.s - from).toBeLessThan(170);
    expect(rider.s - from).toBeGreaterThan(90);
  });

  it("a curve pushes a rider who does not steer to the outside", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0.6 },
      2.5
    );
    expect(rider.x).toBeLessThan(-1.5);
  });

  it("a light steer into the curve holds the lane at a sane speed", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0.2, throttle: 0.6 },
      2.5
    );
    expect(Math.abs(rider.x)).toBeLessThan(1.5);
  });

  it("a lane change takes about half a second and stops when the key lifts", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = field(flat, 1, 0, 0);
    const rider = player(state);
    rider.speed = 40;
    rider.x = 0;
    hold(
      state,
      flat,
      { brake: 0, kick: false, punch: false, steer: 1, throttle: 0.6 },
      0.5
    );
    const atRelease = rider.x;
    expect(atRelease).toBeGreaterThan(3);
    expect(atRelease).toBeLessThan(5.2);
    hold(
      state,
      flat,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0.6 },
      1
    );
    expect(rider.x - atRelease).toBeLessThan(0.9);
  });

  it("the tightest bend cannot be held flat out but can at a sane speed", () => {
    const flatOut = field(quietTrack, 1, 0, 0);
    const fast = player(flatOut);
    fast.s = 1520;
    fast.x = 1.8;
    fast.speed = 58;
    const events = hold(
      flatOut,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: -1, throttle: 1 },
      5
    );
    expect(
      fast.offRoad || events.some((event) => event.kind === "crash")
    ).toBeTruthy();

    const sane = field(quietTrack, 1, 0, 0);
    const steady = player(sane);
    steady.s = 1560;
    steady.x = 0;
    steady.speed = 36;
    hold(
      sane,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: -0.45, throttle: 0.4 },
      3
    );
    expect(steady.mode).toBe("riding");
    expect(Math.abs(steady.x)).toBeLessThan(quietTrack.roadHalfWidth);
  });

  it("the brakes still bite in the tightest bend whichever way the rider steers", () => {
    const braking = brakeIntoBend(1);
    const coasting = brakeIntoBend(0);
    expect([braking.mode, coasting.mode]).toStrictEqual(["riding", "riding"]);
    expect(braking.distance).toBeLessThan(coasting.distance * 0.7);
    expect(brakeAcrossBend(1)).toBeLessThan(brakeAcrossBend(0) - 1.2);
  });

  it("launches over the big crest at speed and lands without crashing", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 56;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 1 },
      5
    );
    const flights = events.filter(
      (event) => event.kind === "land" && event.airSeconds > 0.5
    );
    expect(flights).toHaveLength(1);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
  });

  it("stays on the ground over the same crest at a cruise", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0.2 },
      5
    );
    expect(events.some((event) => event.kind === "land")).toBeFalsy();
  });
});

describe("crashing", () => {
  it("a head-on hit throws the rider, who runs back and rides again", () => {
    const state = field(track, 7, 0, 0);
    const rider = player(state);
    const oncoming = state.cars.find((car) => car.speed < 0 && car.s > 400);
    if (!oncoming) {
      throw new Error("The race has no oncoming traffic.");
    }
    rider.s = oncoming.s - 60;
    rider.x = oncoming.x;
    rider.speed = 35;
    const events = hold(
      state,
      track,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0 },
      1.5
    );
    expect(events.map((event) => event.kind)).toContain("crash");
    expect(rider.mode).toBe("thrown");
    expect(rider.bodyS).toBeGreaterThan(rider.s);

    const later = hold(
      state,
      track,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0 },
      14
    );
    expect(later.map((event) => event.kind)).toContain("remount");
    expect(rider.mode).toBe("riding");
  });

  it("riding into the trees ends in a crash", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 100;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 1, throttle: 1 },
      6
    );
    expect(events.map((event) => event.kind)).toContain("crash");
  });

  it("a gentle head-on bump permits a throttle-and-steer escape", () => {
    const state = field(straight, 1, 0, 0);
    const me = player(state);
    Object.assign(me, { bodyS: 100, bodyX: -1.8, s: 100, speed: 2, x: -1.8 });
    const car = {
      cruiseSpeed: -22,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 2,
      s: 103.1,
      speed: -3,
      x: -1.8,
    };
    state.cars.push(car);
    let stoppedTicks = 0;
    let longestStop = 0;
    for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
      stepRace(state, straight, [
        { ...cruising, steer: me.x < 0 ? 1 : 0, throttle: 1 },
      ]);
      stoppedTicks =
        me.mode === "riding" && me.speed < 0.5 ? stoppedTicks + 1 : 0;
      longestStop = Math.max(longestStop, stoppedTicks);
    }
    expect(me.mode).toBe("riding");
    expect(longestStop).toBeLessThanOrEqual(1.5 * TICK_RATE);
    expect(me.s).toBeGreaterThan(car.s + 20);
  });
});

describe("a full race", () => {
  it("the pilot finishes an empty Ridge Road cleanly in a sensible time", () => {
    const state = field(quietTrack, 1, 0, 0);
    const events = pilotUntilFinish(state, quietTrack, 240);
    const rider = player(state);
    expect(rider.finishTick).toBeGreaterThan(0);
    expect(rider.crashes).toBe(0);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    const seconds = rider.finishTick / TICK_RATE;
    expect(seconds).toBeGreaterThan(140);
    expect(seconds).toBeLessThan(190);
  });

  it("the pilot gets through traffic and still finishes", () => {
    const state = field(track, 11, 0, 0);
    pilotUntilFinish(state, track, 400);
    expect(player(state).finishTick).toBeGreaterThan(0);
  });

  it("replays identically from the same seed and inputs", () => {
    const first = field(track, 3, 0, 0);
    const second = field(track, 3, 0, 0);
    pilotUntilFinish(first, track, 60);
    pilotUntilFinish(second, track, 60);
    expect(second).toStrictEqual(first);
  });
});

const raceIsOver = (rider: RiderState): boolean =>
  rider.finishTick >= 0 || rider.mode === "busted" || rider.mode === "wrecked";

const raceThePack = (seed: number) => {
  const state = createRace(defaultSetup(track, seed));
  const racers = state.riders.filter((rider) => rider.profile.role === "racer");
  const inputs = state.riders.map(() => ({ ...cruising }));
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 300 * TICK_RATE; tick += 1) {
    for (const [index, input] of inputs.entries()) {
      pilotInput(state, track, index, input);
    }
    stepRace(state, track, inputs);
    events.push(...state.events);
    if (racers.every((rider) => raceIsOver(rider))) {
      break;
    }
  }
  return { events, racers, state };
};

describe("the pack", () => {
  it("a punch drains stamina and enough of them knock the rival down", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = field(flat, 1, 1, 0);
    const [me, rival] = state.riders;
    if (!(me && rival)) {
      throw new Error("The race needs a rival.");
    }
    rival.s = 50;
    rival.x = 1.8;
    rival.speed = 30;
    me.s = 50;
    me.x = 0.3;
    me.speed = 30;
    const idle = {
      brake: 0,
      kick: false,
      punch: false,
      steer: 0,
      throttle: 0.5,
    };
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 8 * TICK_RATE; tick += 1) {
      const punching = { ...idle, punch: tick % 20 === 0 };
      stepRace(state, flat, [punching, idle]);
      events.push(...state.events);
      me.x = 0.3;
      me.s = rival.s;
      if (rival.mode !== "riding") {
        break;
      }
    }
    const hits = events.filter((event) => event.kind === "hit");
    expect(hits.length).toBeGreaterThan(3);
    expect(rival.mode).toBe("thrown");
    expect(
      events.some((event) => event.kind === "crash" && event.cause === "combat")
    ).toBeTruthy();
  });

  it("six riders of the new cast each finish Ridge Road, wreck, or are busted by the cop on patrol and the standings are ordered", () => {
    const { events, racers, state } = raceThePack(4);
    const finishTicks = standings(state).map(
      (index) => riderAt(state, index).finishTick
    );
    const finished = finishTicks.filter((tick) => tick >= 0);
    expect({
      placed: finishTicks.length,
      riders: state.riders.length,
      roster: state.riders.map((rider) => rider.profile.name),
    }).toStrictEqual({
      placed: 6,
      riders: 7,
      roster: [
        "You",
        "Dee Santangelo",
        "Moose Kowalczyk",
        "Juno Kade",
        "Mags Dunleavy",
        "Ruth Ann Bixby",
        "Sergeant Dolores Pike",
      ],
    });
    expect(events.some((event) => event.kind === "pursuit")).toBeTruthy();
    expect(racers.every((rider) => raceIsOver(rider))).toBeTruthy();
    expect(finished.length).toBeGreaterThanOrEqual(3);
    expect(finishTicks).toStrictEqual([
      ...finished.toSorted((left, right) => left - right),
      ...finishTicks.filter((tick) => tick < 0),
    ]);
  });

  it("a cop chasing the pack through traffic does not ride into a car", () => {
    const copsInTraffic: RaceEvent[] = [];
    let batonHits = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const { events, state } = raceThePack(seed);
      const byCop = events.filter(
        (event) => riderAt(state, event.rider).profile.role === "police"
      );
      copsInTraffic.push(
        ...byCop.filter(
          (event) => event.kind === "crash" && event.cause === "traffic"
        )
      );
      batonHits += byCop.filter((event) => event.kind === "hit").length;
    }
    expect(copsInTraffic).toStrictEqual([]);
    expect(batonHits).toBeGreaterThan(0);
  });
});

const sideBySide = () => {
  const state = field(straight, 1, 2, 0);
  riderAt(state, 1).s = 900;
  const me = riderAt(state, 0);
  const moose = riderAt(state, 2);
  for (const rider of [me, moose]) {
    rider.s = 50;
    rider.speed = 30;
  }
  return { me, moose, state };
};

const brawl = (
  state: RaceState,
  seconds: number,
  inputsAt: (tick: number) => readonly RiderInput[]
): RaceEvent[] => {
  const me = riderAt(state, 0);
  const moose = riderAt(state, 2);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    me.x = 0.3;
    moose.x = 1.8;
    moose.s = me.s;
    stepRace(state, straight, inputsAt(tick));
    events.push(...state.events);
  }
  return events;
};

const pressing = (key: "punch" | "kick", pressed: boolean): RiderInput => ({
  ...cruising,
  [key]: pressed,
});

describe("recovering", () => {
  it("a rider punched onto the outside grass of a bend at 40 m/s steers back onto the road within two seconds", () => {
    const state = field(quietTrack, 1, 1, 0);
    const me = riderAt(state, 0);
    const rival = riderAt(state, 1);
    me.s = 1550;
    me.speed = 40;
    rival.speed = 40;
    rival.weapon = "none";
    const back = { ...cruising, steer: -1, throttle: 0.6 };
    let punched = -1;
    let onRoad = -1;
    for (let tick = 0; tick < 4 * TICK_RATE && onRoad < 0; tick += 1) {
      if (punched < 0) {
        me.x = quietTrack.roadHalfWidth + 0.5;
        me.lateralSpeed = 0;
        rival.x = me.x - 1.5;
        rival.s = me.s;
      }
      const rivalInput =
        punched < 0
          ? { ...cruising, punch: true, throttle: 0.6 }
          : { ...cruising, brake: 1, throttle: 0 };
      stepRace(state, quietTrack, [punched < 0 ? cruising : back, rivalInput]);
      if (punched < 0 && state.events.some((event) => event.kind === "hit")) {
        punched = tick;
      }
      if (punched >= 0 && Math.abs(me.x) < quietTrack.roadHalfWidth) {
        onRoad = tick;
      }
    }
    expect(punched).toBeGreaterThanOrEqual(0);
    expect(me.mode).toBe("riding");
    expect(onRoad).toBeGreaterThanOrEqual(0);
    expect((onRoad - punched) / TICK_RATE).toBeLessThan(2);
  });
});

describe("weapons", () => {
  it("a club swing drains far more stamina than a punch", () => {
    const punched = sideBySide();
    brawl(punched.state, 1, (tick) => [
      pressing("punch", tick === 0),
      cruising,
      cruising,
    ]);
    const clubbed = sideBySide();
    const events = brawl(clubbed.state, 1, (tick) => [
      cruising,
      cruising,
      pressing("punch", tick === 0),
    ]);
    const fist = MAX_STAMINA - punched.moose.stamina;
    const club = MAX_STAMINA - clubbed.me.stamina;
    expect(fist).toBeGreaterThan(0);
    expect(club).toBeGreaterThan(fist * 1.5);
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: 2,
      target: 0,
      weapon: "club",
    });
  });

  it("a club breaks after six hits and its owner goes back to fists", () => {
    const { moose, me, state } = sideBySide();
    expect(moose.weapon).toBe("club");
    const events = brawl(state, 14, () => {
      me.stamina = MAX_STAMINA;
      return [cruising, cruising, pressing("punch", true)];
    });
    const clubHits = events.filter(
      (event) => event.kind === "hit" && event.weapon === "club"
    );
    expect(clubHits).toHaveLength(6);
    expect(events).toContainEqual({
      kind: "weaponBroken",
      rider: 2,
      weapon: "club",
    });
    expect(moose.weapon).toBe("none");
    expect(events.at(-1)).toMatchObject({ attack: "punch", weapon: "none" });
  });

  it("a kick that lands on an armed rival takes the weapon", () => {
    const { moose, me, state } = sideBySide();
    expect(me.weapon).toBe("none");
    const events = brawl(state, 2, (tick) => [
      tick < 60 ? pressing("kick", tick === 0) : pressing("punch", tick === 60),
      cruising,
      cruising,
    ]);
    expect(events).toContainEqual({
      kind: "weaponTaken",
      rider: 0,
      target: 2,
      weapon: "club",
    });
    expect([me.weapon, moose.weapon]).toStrictEqual(["club", "none"]);
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: 0,
      target: 2,
      weapon: "club",
    });
    expect(me.weaponHits).toBe(5);
  });
});

const patrolFrom = (state: RaceState, copIndex: number, s: number) => {
  const cop = riderAt(state, copIndex);
  cop.parked = false;
  cop.s = s;
  cop.x = track.plan.laneWidth / 2;
  cop.speed = PATROL_SPEED;
  return cop;
};

describe("meeting the police", () => {
  it("a cop parked on the verge pulls out after the pack before the player has ridden a kilometre", () => {
    const state = createRace(defaultSetup(track, 4));
    const cop = riderAt(state, 6);
    expect({
      offRoad: Math.abs(cop.x) > track.roadHalfWidth,
      s: cop.s,
      speed: cop.speed,
    }).toStrictEqual({ offRoad: true, s: 700, speed: 0 });
    const inputs = state.riders.map(() => ({ ...cruising }));
    const pursuits: RaceEvent[] = [];
    let fastestWhileParked = 0;
    while (player(state).s < 1000 && state.tick < 120 * TICK_RATE) {
      for (const [index, input] of inputs.entries()) {
        pilotInput(state, track, index, input);
      }
      stepRace(state, track, inputs);
      pursuits.push(
        ...state.events.filter((event) => event.kind === "pursuit")
      );
      if (pursuits.length === 0) {
        fastestWhileParked = Math.max(fastestWhileParked, cop.speed);
      }
    }
    expect(player(state).s).toBeGreaterThanOrEqual(1000);
    expect(pursuits.length).toBeGreaterThan(0);
    expect({
      fastestWhileParked,
      onRoad: Math.abs(cop.x) < track.roadHalfWidth,
    }).toStrictEqual({ fastestWhileParked: 0, onRoad: true });
  });
});

const crashNearCop = (copS: number, police: PoliceSetup = defaultPolice) => {
  const state = createRace({
    ...defaultSetup(straight, 1),
    police,
    rivals: [],
  });
  const me = riderAt(state, 0);
  const cop = patrolFrom(state, 1, copS);
  me.s = 200;
  me.speed = 15;
  me.stamina = 0;
  const copInput = { ...cruising };
  const flatOut = { ...cruising, throttle: 1 };
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 15 * TICK_RATE; tick += 1) {
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [flatOut, copInput]);
    events.push(...state.events);
  }
  return { cop, events, me, state };
};

describe("police", () => {
  it("a cop busts a rider who is still off the bike when it arrives", () => {
    const { events, me, state } = crashNearCop(150);
    expect(events.map((event) => event.kind)).toContain("crash");
    expect(events).toContainEqual(
      expect.objectContaining({
        cop: 1,
        fine: defaultPolice.fine,
        kind: "busted",
        rider: 0,
      })
    );
    expect(events.map((event) => event.kind)).not.toContain("remount");
    expect({
      mode: me.mode,
      pulledOver: Math.abs(me.bodyX) > straight.roadHalfWidth,
    }).toStrictEqual({ mode: "busted", pulledOver: true });
    expect(standings(state)).toStrictEqual([0]);
  });

  it("the arrest is reported where the body lay and with the weapon the rider was thrown with", () => {
    const state = createRace({ ...defaultSetup(straight, 1), rivals: [] });
    const me = riderAt(state, 0);
    patrolFrom(state, 1, 150);
    me.s = 200;
    me.speed = 15;
    me.stamina = 0;
    arm(me, "chain");
    const copInput = { ...cruising };
    let body = { s: me.bodyS, x: me.bodyX };
    let arrest: RaceEvent | undefined;
    while (!arrest && state.tick < 15 * TICK_RATE) {
      body = { s: me.bodyS, x: me.bodyX };
      pilotInput(state, straight, 1, copInput);
      stepRace(state, straight, [cruising, copInput]);
      arrest = state.events.find((event) => event.kind === "busted");
    }
    if (arrest?.kind !== "busted") {
      throw new Error("The cop made no arrest.");
    }
    expect(arrest.weapon).toBe("chain");
    expect(Math.abs(arrest.s - body.s)).toBeLessThan(0.2);
    expect(Math.abs(arrest.x - body.x)).toBeLessThan(0.2);
    expect({
      arrestedOnTheRoad: Math.abs(arrest.x) < straight.roadHalfWidth,
      movedToTheVerge: Math.abs(me.bodyX) > straight.roadHalfWidth,
      weapon: me.weapon,
    }).toStrictEqual({
      arrestedOnTheRoad: true,
      movedToTheVerge: true,
      weapon: "none",
    });
  });

  it("a rider who remounts and rides away in time is not busted", () => {
    const { cop, events, me } = crashNearCop(60);
    expect(events.map((event) => event.kind)).toContain("remount");
    expect(events).toContainEqual({ kind: "pursuit", rider: 1, target: 0 });
    expect(events.map((event) => event.kind)).not.toContain("busted");
    expect(me.mode).toBe("riding");
    expect(me.s).toBeGreaterThan(cop.s);
  });
});

const knockedOffBeside = (speed: number) => {
  const state = createRace({ ...defaultSetup(straight, 1), rivals: [] });
  const me = riderAt(state, 0);
  const cop = patrolFrom(state, 1, 200);
  cop.speed = speed;
  me.s = 200;
  me.x = 0;
  me.speed = speed;
  me.stamina = 0;
  const copInput = { ...cruising };
  const flatOut = { ...cruising, throttle: 1 };
  let ticksToArrest = -1;
  for (let tick = 0; tick < 15 * TICK_RATE; tick += 1) {
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [flatOut, copInput]);
    if (state.events.some((event) => event.kind === "busted")) {
      ticksToArrest = tick;
    }
  }
  return { mode: me.mode, ticksToArrest };
};

const patrolWithBeat = (beat: number) => {
  const state = createRace({
    ...defaultSetup(straight, 1),
    police: { ...defaultPolice, beat },
    rivals: [],
  });
  const me = riderAt(state, 0);
  const cop = riderAt(state, 1);
  const post = cop.s;
  me.s = post - 10;
  me.x = -1.8;
  const copInput = { ...cruising };
  let chased = false;
  for (let tick = 0; tick < 40 * TICK_RATE; tick += 1) {
    me.speed = 40;
    me.stamina = MAX_STAMINA;
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [cruising, copInput]);
    chased ||= chaserDistance(state, 0) >= 0;
  }
  return {
    chased,
    chasing: chaserDistance(state, 0) >= 0,
    offTheRoad: Math.abs(cop.x) > straight.roadHalfWidth,
    past: cop.s - post,
    speed: cop.speed,
  };
};

describe("the bust window", () => {
  it("a cop beside a rider who is knocked off at walking pace arrests them, but not in the first half second", () => {
    const { mode, ticksToArrest } = knockedOffBeside(4);
    expect(mode).toBe("busted");
    expect(ticksToArrest).toBeGreaterThanOrEqual(30);
    expect(ticksToArrest).toBeLessThan(90);
  });

  it("a cop beside a rider who is knocked off at 160 km/h overshoots, and the rider gets back on", () => {
    expect(knockedOffBeside(45)).toStrictEqual({
      mode: "riding",
      ticksToArrest: -1,
    });
  });

  it("a cop gives up the chase at the end of its beat and pulls off the road", () => {
    const short = patrolWithBeat(400);
    const long = patrolWithBeat(5000);
    expect(short).toMatchObject({
      chased: true,
      chasing: false,
      offTheRoad: true,
      speed: 0,
    });
    expect(short.past).toBeGreaterThan(400);
    expect(short.past).toBeLessThan(550);
    expect(long).toMatchObject({ chasing: true, offTheRoad: false });
  });
});

const parked: RiderInput = { ...cruising, brake: 1, throttle: 0 };

describe("the end of a patrol", () => {
  it("a cop that reaches the end of the track pulls off the road and the traffic behind it drives on", () => {
    const state = field(track, 7, 0, 1);
    const cop = patrolFrom(state, 1, track.length - 79);
    cop.speed = 3;
    const follower = state.cars.find((car) => car.speed > 0);
    if (!follower) {
      throw new Error("The race has no traffic going the cop's way.");
    }
    follower.s = cop.s - 40;
    const copInput = { ...cruising };
    let slowest = follower.speed;
    for (let tick = 0; tick < 12 * TICK_RATE; tick += 1) {
      pilotInput(state, track, 1, copInput);
      stepRace(state, track, [parked, copInput]);
      slowest = Math.min(slowest, follower.speed);
    }
    expect(cop.mode).toBe("riding");
    expect(cop.speed).toBe(0);
    expect(Math.abs(cop.x)).toBeGreaterThan(track.roadHalfWidth);
    expect(slowest).toBeGreaterThan(10);
    expect(follower.s).toBeGreaterThan(cop.s + 50);
  });
});

const column = (riderCount: number) => {
  const setup = defaultSetup(straight, 1);
  const state = createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: setup.rivals
      .slice(0, riderCount - 1)
      .map((rival) => ({ ...rival, bike: setup.player.bike })),
  });
  for (const rider of state.riders) {
    rider.s = 100;
    rider.x = 0;
    rider.speed = 30;
  }
  return state;
};

const pileup = (movingIndex: number) => {
  const state = column(3);
  const rear = riderAt(state, 0);
  rear.speed = 45;
  const moving = riderAt(state, movingIndex);
  moving.s = 101.8;
  moving.x = -0.3;
  const stopped = riderAt(state, 3 - movingIndex);
  stopped.s = 102.5;
  stopped.x = 0.3;
  stopped.speed = 0;
  return { moving, rear, state, stopped };
};

const ride = <Sample>(
  state: RaceState,
  seconds: number,
  sample: (events: readonly RaceEvent[]) => Sample
): Sample[] => {
  const inputs = state.riders.map(() => cruising);
  const samples: Sample[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, straight, inputs);
    samples.push(sample(state.events));
  }
  return samples;
};

describe("rider contact", () => {
  it.each([
    { front: 1, rear: 0 },
    { front: 0, rear: 1 },
  ])(
    "a rider who runs into the back of another stays behind ($rear into $front)",
    ({ front, rear }) => {
      const state = column(2);
      const behind = riderAt(state, rear);
      const ahead = riderAt(state, front);
      behind.s = ahead.s - 1.5;
      behind.speed = 34;
      const gaps = ride(state, 1, () => ahead.s - behind.s);
      expect(behind.mode).toBe("riding");
      expect(Math.min(...gaps)).toBeGreaterThan(0);
    }
  );

  it("a rider who runs into a stopped bike at 60 m/s takes the damage of a 60 m/s crash", () => {
    const state = column(2);
    const rear = riderAt(state, 0);
    const ahead = riderAt(state, 1);
    rear.s = ahead.s - 2.6;
    rear.speed = 60;
    ahead.speed = 0;
    const crashes = ride(state, 0.1, (events) =>
      events.flatMap((event) =>
        event.kind === "crash" && event.rider === 0 ? [event.speed] : []
      )
    ).flat();
    expect(crashes).toHaveLength(1);
    expect(crashes[0]).toBeGreaterThan(58);
    expect(FULL_CONDITION - rear.condition).toBeCloseTo(32.4, 0);
    expect(rear.bodyS).toBeLessThan(ahead.s);
  });

  it.each([
    { across: 0, back: 2.1, speed: 60 },
    { across: 0, back: 2.5, speed: 60 },
    { across: 0, back: 2.9, speed: 60 },
    { across: 0, back: 3.05, speed: 60 },
    { across: 0.5, back: 2.2, speed: 45 },
    { across: 0.5, back: 2.65, speed: 45 },
    { across: -0.7, back: 2.4, speed: 30 },
    { across: -0.7, back: 2.45, speed: 30 },
  ])(
    "a rider closing at $speed m/s from $back m behind a stopped bike, $across m across, is thrown off the back of it and not shoved past",
    ({ across, back, speed }) => {
      const state = column(2);
      const rear = riderAt(state, 0);
      const ahead = riderAt(state, 1);
      rear.s = ahead.s - back;
      rear.x = across;
      rear.speed = speed;
      ahead.speed = 0;
      const events = ride(state, 0.2, (tick) =>
        tick.flatMap((event) => {
          if (event.kind === "crash" && event.rider === 0) {
            return [event.cause];
          }
          return event.kind === "riderContact" ? ["shove"] : [];
        })
      ).flat();
      expect(events).toStrictEqual(["rider"]);
      expect(rear.x).toBeCloseTo(across, 5);
      expect(rear.bodyS).toBeLessThan(ahead.s);
      expect(ahead.speed).toBeGreaterThan(0);
    }
  );

  it("a rider who drifts across into a slower bike alongside is shoved and keeps riding", () => {
    const state = column(2);
    const passing = riderAt(state, 0);
    const slower = riderAt(state, 1);
    passing.s = slower.s - 1;
    passing.x = 0.9;
    passing.speed = 42;
    passing.lateralSpeed = -4;
    const shoves = ride(
      state,
      0.2,
      (tick) => tick.filter((event) => event.kind === "riderContact").length
    );
    expect(Math.max(...shoves)).toBe(1);
    expect([passing.mode, slower.mode]).toStrictEqual(["riding", "riding"]);
    expect(passing.x - slower.x).toBeGreaterThan(0.8);
  });

  it("a rider squeezed from both sides for a second loses about 6 m/s, not all of their speed", () => {
    const state = column(3);
    const [me, left, right] = [0, 1, 2].map((index) => riderAt(state, index));
    if (!(me && left && right)) {
      throw new Error("The column has fewer than three riders.");
    }
    left.x = -0.9;
    right.x = 0.9;
    for (const rider of state.riders) {
      rider.speed = 40;
    }
    const flatOut = { ...cruising, throttle: 1 };
    let contacts = 0;
    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      stepRace(state, straight, [
        flatOut,
        { ...flatOut, steer: 1 },
        { ...flatOut, steer: -1 },
      ]);
      contacts += state.events.filter(
        (event) => event.kind === "riderContact"
      ).length;
    }
    expect(contacts).toBeGreaterThan(20);
    expect(me.mode).toBe("riding");
    expect(me.speed).toBeGreaterThan(32);
    expect(me.speed).toBeLessThan(38);
  });

  it("two bikes that lean on each other from a standstill both pull away", () => {
    const state = column(2);
    const behind = riderAt(state, 0);
    const ahead = riderAt(state, 1);
    behind.s = ahead.s - 1.975;
    behind.x = 0.43;
    ahead.x = -0.43;
    behind.speed = 0;
    ahead.speed = 0;
    const flatOut = { ...cruising, throttle: 1 };
    for (let tick = 0; tick < 5 * TICK_RATE; tick += 1) {
      stepRace(state, straight, [
        { ...flatOut, steer: -0.5 },
        { ...flatOut, steer: 0.5 },
      ]);
    }
    expect(behind.speed).toBeGreaterThan(8);
    expect(ahead.speed).toBeGreaterThan(8);
  });

  it("a pileup throws each rider at most once a tick", () => {
    const { rear, state, stopped } = pileup(1);
    const crashes = ride(state, 0.5, (events) =>
      state.riders.map(
        (_, index) =>
          events.filter(
            (event) => event.kind === "crash" && event.rider === index
          ).length
      )
    ).flat();
    expect(Math.max(...crashes)).toBe(1);
    expect(rear.crashes).toBe(1);
    expect(rear.bodyS).toBeGreaterThan(stopped.s);
  });

  it("a pileup launches the rear rider and leaves the two in front the same whichever of them is listed first", () => {
    const [first, swapped] = [1, 2].map((movingIndex) => {
      const { moving, rear, state, stopped } = pileup(movingIndex);
      const launches = ride(state, 0.5, (events) =>
        events.flatMap((event) =>
          event.kind === "crash" && event.rider === 0 ? [event.speed] : []
        )
      ).flat();
      return {
        launches,
        moving: [moving.mode, moving.s, moving.x, moving.speed],
        rear: [rear.bodyS, rear.bodyX, rear.s, rear.x],
        stopped: [stopped.mode, stopped.s, stopped.x, stopped.speed],
      };
    });
    expect(first?.launches).toHaveLength(1);
    expect(first?.launches[0]).toBeGreaterThan(20);
    expect(swapped).toStrictEqual(first);
  });
});

describe("simultaneous strikes", () => {
  it("two riders who punch each other on the same tick both land", () => {
    const { moose, me, state } = sideBySide();
    moose.weapon = "none";
    moose.weaponHits = 0;
    const events = brawl(state, 1, (tick) => [
      pressing("punch", tick === 0),
      cruising,
      pressing("punch", tick === 0),
    ]);
    const hits = events.filter((event) => event.kind === "hit");
    expect(hits).toContainEqual({
      attack: "punch",
      kind: "hit",
      rider: 0,
      target: 2,
      weapon: "none",
    });
    expect(hits).toContainEqual({
      attack: "punch",
      kind: "hit",
      rider: 2,
      target: 0,
      weapon: "none",
    });
    expect(me.stamina).toBe(moose.stamina);
    expect(me.stamina).toBeLessThan(MAX_STAMINA);
  });

  it("two riders who punch each other on the same tick are stunned for the same time", () => {
    const { moose, me, state } = sideBySide();
    disarm(moose);
    const stuns: number[][] = [];
    brawl(state, 0.5, (tick) => {
      stuns.push([me.hitStun, moose.hitStun]);
      return [
        pressing("punch", tick === 0),
        cruising,
        pressing("punch", tick === 0),
      ];
    });
    expect(Math.max(...stuns.flat())).toBe(10);
    expect(stuns.filter(([mine, theirs]) => mine !== theirs)).toStrictEqual([]);
  });
});

const duel = (
  unarmedIndex: number,
  inputsAt: (tick: number) => { unarmed: RiderInput; holder: RiderInput }
) => {
  const state = field(straight, 1, 1, 0);
  const unarmed = riderAt(state, unarmedIndex);
  const holder = riderAt(state, 1 - unarmedIndex);
  disarm(unarmed);
  arm(holder, "chain");
  for (const rider of state.riders) {
    rider.s = 50;
    rider.speed = 30;
  }
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    unarmed.x = 0.3;
    holder.x = 1.8;
    holder.s = unarmed.s;
    const inputs = inputsAt(tick);
    stepRace(
      state,
      straight,
      unarmedIndex === 0
        ? [inputs.unarmed, inputs.holder]
        : [inputs.holder, inputs.unarmed]
    );
  }
  return {
    holder: [holder.weapon, holder.weaponHits],
    unarmed: [unarmed.weapon, unarmed.weaponHits],
  };
};

describe("simultaneous weapon grabs", () => {
  it.each([{ unarmedIndex: 0 }, { unarmedIndex: 1 }])(
    "an unarmed rider and a chain holder who kick each other on the same tick leave the chain with the unarmed one (unarmed is rider $unarmedIndex)",
    ({ unarmedIndex }) => {
      const after = duel(unarmedIndex, (tick) => ({
        holder: pressing("kick", tick === 0),
        unarmed: pressing("kick", tick === 0),
      }));
      expect(after).toStrictEqual({
        holder: ["none", 0],
        unarmed: ["chain", 8],
      });
    }
  );

  it.each([{ unarmedIndex: 0 }, { unarmedIndex: 1 }])(
    "a chain that lands on the tick it is kicked away has one hit fewer (unarmed is rider $unarmedIndex)",
    ({ unarmedIndex }) => {
      const after = duel(unarmedIndex, (tick) => ({
        holder: pressing("punch", tick === 1),
        unarmed: pressing("kick", tick === 0),
      }));
      expect(after).toStrictEqual({
        holder: ["none", 0],
        unarmed: ["chain", 7],
      });
    }
  );
});

describe("armed rivals", () => {
  it("a chain holder at full aggression swings at a rider 2.8 m across within five seconds", () => {
    const state = field(straight, 1, 1, 0);
    const dee = riderAt(state, 1);
    const rival = { ...dee, profile: { ...dee.profile, aggression: 1 } };
    state.riders[1] = rival;
    state.tick = 10 * TICK_RATE;
    const me = riderAt(state, 0);
    const rivalInput = { ...cruising };
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 5 * TICK_RATE; tick += 1) {
      for (const rider of state.riders) {
        rider.s = 50;
        rider.speed = 30;
      }
      me.x = -1;
      rival.x = 1.8;
      pilotInput(state, straight, 1, rivalInput);
      stepRace(state, straight, [cruising, rivalInput]);
      events.push(...state.events);
    }
    expect(rival.weapon).toBe("chain");
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: 1,
      target: 0,
      weapon: "chain",
    });
  });
});

const pilotPack = (states: readonly RaceState[], seconds: number) => {
  const inputs = states.map((state) =>
    state.riders.map(() => ({ ...cruising }))
  );
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    for (const [raceIndex, state] of states.entries()) {
      const each = inputs[raceIndex] ?? [];
      for (const [index, input] of each.entries()) {
        pilotInput(state, track, index, input);
      }
      stepRace(state, track, each);
    }
  }
};

describe("replays", () => {
  it("a six-rider pack replays the same from the same seed, alone or beside another race", () => {
    const alone = createRace(defaultSetup(track, 5));
    pilotPack([alone], 40);
    const again = createRace(defaultSetup(track, 5));
    pilotPack([again], 40);
    const beside = createRace(defaultSetup(track, 5));
    const other = createRace(defaultSetup(track, 9));
    pilotPack([beside, other], 40);
    expect(JSON.stringify(again)).toBe(JSON.stringify(alone));
    expect(JSON.stringify(beside)).toBe(JSON.stringify(alone));
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(alone));
  });
});

const alone = (course: Track, bike: BikeSpec): RaceState => {
  const setup = defaultSetup(course, 1);
  return createRace({
    ...setup,
    player: { ...setup.player, bike },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

const SWITCHBACK_FROM = 1670;
const SWITCHBACK_TO = 1840;

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
    const inside = Math.sign(curvatureAt(quietTrack, rider.s));
    stepRace(state, quietTrack, [
      { ...cruising, steer: inBend ? inside : 0, throttle: 1 },
    ]);
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
  it("a Featherweight takes the Switchback flat out where the Sesta cannot", () => {
    const wren = bikes["halden-wren-400"];
    const sesta = bikes["ostra-sesta-600"];
    expect({
      sesta: pushedWideInSwitchback(sesta),
      wren: pushedWideInSwitchback(wren),
    }).toStrictEqual({ sesta: true, wren: false });
    expect({
      sestaAbove: pushedWideInSwitchback(sesta, 199 * 1.05),
      sestaBelow: pushedWideInSwitchback(sesta, 199 * 0.95),
      wrenAbove: pushedWideInSwitchback(wren, 229 * 1.05),
      wrenBelow: pushedWideInSwitchback(wren, 229 * 0.95),
    }).toStrictEqual({
      sestaAbove: true,
      sestaBelow: false,
      wrenAbove: true,
      wrenBelow: false,
    });
  });

  it.each([
    { bike: bikes["gutter-pup-250"], kmh: 204 },
    { bike: bikes["halden-kite-500"], kmh: 215 },
    { bike: bikes["ostra-sette-750"], kmh: 194 },
    { bike: bikes["brack-stoker-800"], kmh: 186 },
    { bike: bikes["halden-meridian-900"], kmh: 194 },
    { bike: bikes["brack-anvil-1100"], kmh: 175 },
    { bike: bikes["ostra-nera-1000"], kmh: 185 },
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

const rivalsOf = (state: RaceState): number[] =>
  state.riders
    .slice(1)
    .filter((rider) => rider.profile.role === "racer")
    .map((rider) => rider.s);

const everyRival = Object.values(rivals).map((rival) => rivalAt(rival, 3));

const setupWith = (entrants: readonly RivalSetup[]): RaceSetup => ({
  ...defaultSetup(straight, 1),
  rivals: entrants,
});

describe("race setups", () => {
  it("a setup that lists a rival twice is rejected", () => {
    const [dee, moose] = everyRival;
    if (!(dee && moose)) {
      throw new Error("The cast has fewer than two rivals.");
    }
    const setup = setupWith([dee, moose, dee]);
    expect(validateSetup(setup)).toStrictEqual([
      { kind: "duplicateRival", name: dee.name },
    ]);
    expect(() => createRace(setup)).toThrow(
      `${dee.name} is on the grid more than once.`
    );
  });

  it("a setup with eight rivals is rejected and seven fill the grid", () => {
    const eight = setupWith(everyRival.slice(0, 8));
    const seven = setupWith(everyRival.slice(0, 7));
    expect(validateSetup(eight)).toStrictEqual([
      { count: 8, kind: "tooManyRivals" },
    ]);
    expect(() => createRace(eight)).toThrow("at most 7 rivals");
    expect(validateSetup(seven)).toStrictEqual([]);
    expect(
      createRace(seven).riders.filter((rider) => rider.profile.role === "racer")
    ).toHaveLength(8);
  });

  it("every problem with a setup is reported at once", () => {
    const [dee] = everyRival;
    if (!dee) {
      throw new Error("The cast has no rivals.");
    }
    const setup = setupWith([...everyRival.slice(0, 8), dee]);
    expect(validateSetup(setup).map((problem) => problem.kind)).toStrictEqual([
      "tooManyRivals",
      "duplicateRival",
    ]);
    expect(() => createRace(setup)).toThrow(
      `A race takes at most 7 rivals, and this one has 9. ${dee.name} is on the grid more than once.`
    );
  });
});

describe("the grid", () => {
  it("the player starts behind every rival when the grid order puts them last", () => {
    const setup = defaultSetup(track, 1);
    const last = createRace({ ...setup, gridOrder: "playerLast" });
    const first = createRace({ ...setup, gridOrder: "playerFirst" });
    expect(rivalsOf(last)).toHaveLength(5);
    expect(player(last).s).toBeLessThan(Math.min(...rivalsOf(last)));
    expect(player(first).s).toBeGreaterThanOrEqual(
      Math.max(...rivalsOf(first))
    );
  });

  it("the player starts with the weapon and the hits left that the setup carries over", () => {
    const setup = defaultSetup(straight, 1);
    const state = createRace({
      ...setup,
      player: { ...setup.player, weapon: "chain", weaponHits: 3 },
      police: { ...setup.police, count: 0 },
      rivals: setup.rivals.slice(0, 2),
    });
    const me = riderAt(state, 0);
    const moose = riderAt(state, 2);
    riderAt(state, 1).s = 900;
    disarm(moose);
    for (const rider of [me, moose]) {
      rider.s = 50;
      rider.speed = 30;
    }
    expect([me.weapon, me.weaponHits]).toStrictEqual(["chain", 3]);
    const events = brawl(state, 8, () => {
      moose.stamina = MAX_STAMINA;
      return [pressing("punch", true), cruising, cruising];
    });
    expect(
      events.filter((event) => event.kind === "hit" && event.weapon === "chain")
    ).toHaveLength(3);
    expect(me.weapon).toBe("none");
  });
});

const headOn = (
  state: RaceState,
  rider: RiderState,
  speed = 56,
  ahead = 60
): RaceEvent[] => {
  const [car] = state.cars;
  if (!car) {
    throw new Error("The race has no car.");
  }
  car.s = rider.s + ahead;
  car.speed = car.cruiseSpeed;
  rider.x = car.x;
  rider.speed = speed;
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
    stepRace(state, straight, [{ ...cruising, throttle: 1 }]);
    events.push(...state.events);
    const down = events.some((event) => event.kind === "crash");
    if (down && (rider.mode === "riding" || rider.parked)) {
      break;
    }
  }
  return events;
};

const KMH = 3.6;

const oncomingCar = (state: RaceState): void => {
  state.cars.push({
    cruiseSpeed: -22,
    halfLength: 2.2,
    halfWidth: 0.92,
    height: 1.45,
    paint: 2,
    s: 0,
    speed: -22,
    x: -1.8,
  });
};

const knockedOffAt = (kmh: number): number => {
  const state = field(straight, 1, 0, 0);
  const me = riderAt(state, 0);
  me.s = 100;
  me.speed = kmh / KMH;
  me.stamina = 0;
  stepRace(state, straight, [cruising]);
  return FULL_CONDITION - me.condition;
};

const headOnAt = (kmh: number): number => {
  const state = field(straight, 1, 0, 0);
  const me = riderAt(state, 0);
  me.s = 100;
  oncomingCar(state);
  headOn(state, me, kmh / KMH, 8);
  return FULL_CONDITION - me.condition;
};

const crashesToWreck = (crash: (state: RaceState) => void): number => {
  const state = field(straight, 1, 0, 0);
  const me = riderAt(state, 0);
  me.s = 100;
  oncomingCar(state);
  while (me.mode !== "wrecked" && me.crashes < 20) {
    crash(state);
  }
  return me.crashes;
};

const knockOffAndRemount = (state: RaceState, kmh: number): void => {
  const me = riderAt(state, 0);
  me.speed = kmh / KMH;
  me.stamina = 0;
  const [car] = state.cars;
  if (car) {
    car.s = me.s - 400;
  }
  for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
    stepRace(state, straight, [cruising]);
    if (me.mode === "riding" || me.mode === "wrecked") {
      break;
    }
  }
};

describe("bike condition", () => {
  it("a crash at 200 km/h costs about 30% of the bike, one at 100 km/h about 15%, and a tip-over at walking pace almost nothing", () => {
    expect({
      headOn: [100, 200].map((kmh) => Math.round(headOnAt(kmh))),
      knockdown: [10, 60, 100, 150, 200].map((kmh) =>
        Math.round(knockedOffAt(kmh))
      ),
    }).toStrictEqual({
      headOn: [17, 34],
      knockdown: [3, 8, 14, 21, 28],
    });
  });

  it("three or four hard crashes wreck a bike, and it takes about twice as many at half the speed", () => {
    expect({
      knockdownsAt100: crashesToWreck((state) => {
        knockOffAndRemount(state, 100);
      }),
      knockdownsAt200: crashesToWreck((state) => {
        knockOffAndRemount(state, 200);
      }),
      trafficAt160: crashesToWreck((state) => {
        headOn(state, riderAt(state, 0), 160 / KMH, 8);
      }),
      trafficAt200: crashesToWreck((state) => {
        headOn(state, riderAt(state, 0), 200 / KMH, 8);
      }),
    }).toStrictEqual({
      knockdownsAt100: 8,
      knockdownsAt200: 4,
      trafficAt160: 4,
      trafficAt200: 3,
    });
  });

  it("three hard traffic crashes wreck the bike and the rider is placed after everyone else", () => {
    const state = field(straight, 1, 2, 0);
    const me = riderAt(state, 0);
    const finisher = riderAt(state, 1);
    finisher.s = straight.length - 20;
    finisher.speed = 30;
    me.s = 100;
    oncomingCar(state);
    const conditions: number[] = [];
    const kinds: string[] = [];
    for (let crash = 0; crash < 3; crash += 1) {
      kinds.push(...headOn(state, me).map((event) => event.kind));
      conditions.push(me.condition);
    }
    expect(conditions[0]).toBeLessThan(70);
    expect(conditions.slice(1).map((left) => left > 0)).toStrictEqual([
      true,
      false,
    ]);
    expect(
      ["crash", "remount", "wrecked"].map(
        (wanted) => kinds.filter((kind) => kind === wanted).length
      )
    ).toStrictEqual([3, 2, 1]);
    expect({
      finished: finisher.finishTick >= 0,
      mode: me.mode,
      offTheRoad: Math.abs(me.x) > straight.roadHalfWidth,
    }).toStrictEqual({ finished: true, mode: "wrecked", offTheRoad: true });
    expect(standings(state)).toStrictEqual([1, 2, 0]);
  });

  it("the traffic drives on past a wreck that has come to rest", () => {
    const state = field(straight, 1, 0, 0);
    const me = riderAt(state, 0);
    me.s = 100;
    me.condition = 1;
    state.cars.push({
      cruiseSpeed: -22,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 2,
      s: 0,
      speed: -22,
      x: -1.8,
    });
    headOn(state, me);
    const [car] = state.cars;
    hold(state, straight, cruising, 6);
    expect(me.mode).toBe("wrecked");
    expect(Math.abs(car?.speed ?? 0)).toBeGreaterThan(20);
  });
});

const knockedOffTrack = (ticksAfterPunch: number): RaceEvent[] => {
  const { moose, me, state } = sideBySide();
  const crashes: RaceEvent[] = [];
  let punchedAt = -1;
  for (let tick = 0; tick < 3 * TICK_RATE && crashes.length === 0; tick += 1) {
    me.x = 0.3;
    moose.s = me.s;
    moose.x =
      punchedAt >= 0 && state.tick + 1 === punchedAt + ticksAfterPunch
        ? straight.vergeHalfWidth + 1
        : 1.8;
    stepRace(state, straight, [
      pressing("punch", tick === 0),
      cruising,
      cruising,
    ]);
    if (state.events.some((event) => event.kind === "hit")) {
      punchedAt = state.tick;
    }
    crashes.push(...state.events.filter((event) => event.kind === "crash"));
  }
  return crashes;
};

describe("crash attribution", () => {
  it("a crash within a second of a punch names the rider who threw it, and a later one names nobody", () => {
    expect(knockedOffTrack(60)).toMatchObject([
      { by: 0, cause: "offTrack", rider: 2 },
    ]);
    expect(knockedOffTrack(61)).toMatchObject([
      { by: -1, cause: "offTrack", rider: 2 },
    ]);
  });

  it("a rider knocked down by punches is put down to the puncher, and a rider who falls alone to nobody", () => {
    const { moose, state } = sideBySide();
    moose.stamina = 10;
    const fight = brawl(state, 1, (tick) => [
      pressing("punch", tick === 0),
      cruising,
      cruising,
    ]);
    expect(fight.filter((event) => event.kind === "crash")).toMatchObject([
      { by: 0, cause: "combat", rider: 2 },
    ]);

    const solo = field(quietTrack, 1, 0, 0);
    player(solo).s = 100;
    player(solo).speed = 30;
    const fall = hold(solo, quietTrack, { ...cruising, steer: 1 }, 6);
    expect(fall.filter((event) => event.kind === "crash")).toMatchObject([
      { by: -1, rider: 0 },
    ]);
  });
});

const steerAway = (weapon: "none" | "sign", seconds: number): number => {
  const state = field(straight, 1, 0, 0);
  const rider = player(state);
  rider.speed = 40;
  arm(rider, weapon);
  hold(state, straight, { ...cruising, steer: 1, throttle: 0.6 }, seconds);
  return rider.lateralSpeed;
};

const reaches = (weapon: WeaponKind, across = 2.8): boolean => {
  const { moose, state } = sideBySide();
  arm(moose, weapon);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    riderAt(state, 0).x = -1;
    moose.x = across - 1;
    moose.s = riderAt(state, 0).s;
    stepRace(state, straight, [
      cruising,
      cruising,
      pressing("punch", tick === 0),
    ]);
    events.push(...state.events);
  }
  return events.some((event) => event.kind === "hit");
};

const ticksBetweenHits = (weapon: WeaponKind): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  const landedAt: number[] = [];
  brawl(state, 3, () => {
    me.stamina = MAX_STAMINA;
    if (state.events.some((event) => event.kind === "hit")) {
      landedAt.push(state.tick);
    }
    return [cruising, cruising, pressing("punch", true)];
  });
  const [first = 0, second = 0] = landedAt;
  return second - first;
};

const staminaLostTo = (weapon: "sign" | "club"): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  brawl(state, 1, (tick) => [
    cruising,
    cruising,
    pressing("punch", tick === 0),
  ]);
  return MAX_STAMINA - me.stamina;
};

const ticksToLand = (weapon: WeaponKind, steer: number): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  me.x = 0.6;
  let pressed = -1;
  let landed = -1;
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    moose.x = 1.8;
    moose.s = me.s;
    stepRace(state, straight, [
      { ...cruising, steer },
      cruising,
      pressing("punch", tick === 0),
    ]);
    for (const event of state.events) {
      if (event.kind === "attack" && event.rider === 2) {
        pressed = state.tick;
      }
      if (event.kind === "hit" && event.rider === 2) {
        landed = state.tick;
      }
    }
  }
  return landed < 0 ? -1 : landed - pressed;
};

describe("the new weapons", () => {
  it("a stop sign lands half a second after the press, so a rider who steers away at once is out of reach, and a club lands before they can be", () => {
    expect({
      club: ticksToLand("club", 0),
      clubDodged: ticksToLand("club", -1),
      sign: ticksToLand("sign", 0),
      signDodged: ticksToLand("sign", -1),
    }).toStrictEqual({ club: 9, clubDodged: 9, sign: 30, signDodged: -1 });
  });

  it("a pool cue breaks after three hits", () => {
    const { moose, me, state } = sideBySide();
    arm(moose, "cue");
    const events = brawl(state, 10, () => {
      me.stamina = MAX_STAMINA;
      return [cruising, cruising, pressing("punch", true)];
    });
    expect(
      events.filter((event) => event.kind === "hit" && event.weapon === "cue")
    ).toHaveLength(3);
    expect(events).toContainEqual({
      kind: "weaponBroken",
      rider: 2,
      weapon: "cue",
    });
    expect(moose.weapon).toBe("none");
  });

  it("a pool cue reaches a rider 2.8 m across, where a club does not", () => {
    expect({ club: reaches("club"), cue: reaches("cue") }).toStrictEqual({
      club: false,
      cue: true,
    });
  });

  it("a pool cue has the longest reach, 3.3 m across where a chain falls short, and still not a full lane", () => {
    expect({
      chain: reaches("chain", 3.3),
      cue: reaches("cue", 3.3),
      cueAcrossTheLane: reaches("cue", 3.5),
    }).toStrictEqual({ chain: false, cue: true, cueAcrossTheLane: false });
  });

  it("a stop sign comes round again more slowly than any other weapon, and a pool cue fastest", () => {
    expect({
      club: ticksBetweenHits("club"),
      cue: ticksBetweenHits("cue"),
      sign: ticksBetweenHits("sign"),
    }).toStrictEqual({ club: 40, cue: 30, sign: 66 });
  });

  it("a stop sign hits harder than a club and its holder answers the bars more slowly", () => {
    expect(staminaLostTo("sign")).toBeGreaterThan(staminaLostTo("club"));
    expect(steerAway("sign", 0.05)).toBeLessThan(
      steerAway("none", 0.05) * 0.95
    );
    expect(steerAway("sign", 1)).toBeCloseTo(steerAway("none", 1), 1);
  });
});

const hitsByTheRival = (
  rival: RivalSetup,
  bystanderAcross: number,
  playerAcross = -1.2
) => {
  const setup = defaultSetup(straight, 1);
  const [, other] = setup.rivals;
  if (!other) {
    throw new Error("The default field has no second rival.");
  }
  const state = createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: [rival, other],
  });
  state.tick = 10 * TICK_RATE;
  const rivalInput = { ...cruising };
  const targets: number[] = [];
  for (let tick = 0; tick < 6 * TICK_RATE; tick += 1) {
    for (const rider of state.riders) {
      rider.s = 50;
      rider.speed = 30;
      rider.stamina = MAX_STAMINA;
    }
    riderAt(state, 0).x = playerAcross;
    riderAt(state, 1).x = 0;
    riderAt(state, 2).x = bystanderAcross;
    pilotInput(state, straight, 1, rivalInput);
    stepRace(state, straight, [cruising, rivalInput, cruising]);
    targets.push(
      ...state.events.flatMap((event) =>
        event.kind === "hit" && event.rider === 1 ? [event.target] : []
      )
    );
  }
  return targets;
};

describe("grudges", () => {
  it("a rival with a grudge attacks its target rather than a nearer rider when both are in reach", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const impartial = hitsByTheRival({ ...dee, aggression: 1 }, 2);
    const grudging = hitsByTheRival({ ...dee, aggression: 1, grudge: 2 }, 2);
    expect(impartial[0]).toBe(0);
    expect(grudging.length).toBeGreaterThan(0);
    expect(new Set(grudging)).toStrictEqual(new Set([2]));
  });

  it("a rival who is otherwise peaceful attacks the player it has a score to settle with, and nobody else", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const sore = { ...dee, aggression: 0, aggressionBoost: 1 };
    const alongside = hitsByTheRival(sore, 2);
    expect(alongside.length).toBeGreaterThan(0);
    expect(new Set(alongside)).toStrictEqual(new Set([0]));
    expect(hitsByTheRival(sore, 2, -12)).toStrictEqual([]);
  });

  it("a rival who has gone soft on the player leaves them alone and still fights the others", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const friendly = { ...dee, aggression: 1, aggressionBoost: -1 };
    const others = hitsByTheRival(friendly, 2, -12);
    expect(hitsByTheRival(friendly, 12)).toStrictEqual([]);
    expect(others.length).toBeGreaterThan(0);
    expect(new Set(others)).toStrictEqual(new Set([2]));
  });

  it("a grudge picks the target and leaves the rival's aggression toward that rider as it was", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const peaceful = { ...dee, aggression: 0, aggressionBoost: 1, grudge: 2 };
    expect(hitsByTheRival(peaceful, 2, -12)).toStrictEqual([]);
  });
});

const chase = (police: PoliceSetup, lead: number, quarrySpeed: number) => {
  const state = createRace({
    ...defaultSetup(straight, 1),
    police,
    rivals: [],
  });
  const me = riderAt(state, 0);
  const cop = patrolFrom(state, 1, 100);
  const copInput = { ...cruising };
  let pursued = false;
  let fastest = 0;
  for (let tick = 0; tick < 12 * TICK_RATE; tick += 1) {
    me.s = cop.s + lead;
    me.x = -1.8;
    me.speed = quarrySpeed;
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [cruising, copInput]);
    pursued ||= state.events.some((event) => event.kind === "pursuit");
    fastest = Math.max(fastest, cop.speed);
  }
  return { distance: chaserDistance(state, 0), fastest, pursued };
};

const rideToBody = (police: PoliceSetup) => {
  const state = createRace({
    ...defaultSetup(straight, 1),
    police,
    rivals: [],
  });
  const me = riderAt(state, 0);
  const cop = patrolFrom(state, 1, 150);
  cop.speed = 0;
  me.s = 190;
  me.speed = 15;
  me.stamina = 0;
  const copInput = { ...cruising };
  let fastest = 0;
  let ticksAfterTheBody = 0;
  for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [cruising, copInput]);
    if (cop.chase === 0 && me.mode === "thrown") {
      fastest = Math.max(fastest, cop.speed);
      ticksAfterTheBody += 1;
    }
  }
  return { fastest, ticksAfterTheBody };
};

describe("police settings", () => {
  it("the number of cops and the fine come from the setup", () => {
    const police = { ...defaultPolice, count: 3, fine: 900 };
    const { events, state } = crashNearCop(150, police);
    const cops = state.riders.filter(
      (rider) => rider.profile.role === "police"
    );
    expect(cops.map((cop) => cop.profile.name)).toStrictEqual([
      "Sergeant Dolores Pike",
      "Sergeant Dolores Pike",
      "Sergeant Dolores Pike",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        cop: 1,
        fine: 900,
        kind: "busted",
        rider: 0,
      })
    );
  });

  it("a cop sees as far as the setup says and no further", () => {
    const near = chase({ ...defaultPolice, sightRange: 40 }, 50, PATROL_SPEED);
    const far = chase({ ...defaultPolice, sightRange: 60 }, 50, PATROL_SPEED);
    expect({ distance: near.distance, pursued: near.pursued }).toStrictEqual({
      distance: -1,
      pursued: false,
    });
    expect(far.pursued).toBeTruthy();
    expect(far.distance).toBeGreaterThan(45);
    expect(far.distance).toBeLessThan(55);
  });

  it("a cop riding to a downed rider keeps to the pursuit speed the setup allows", () => {
    const slow = rideToBody({ ...defaultPolice, topSpeed: 10 });
    const quick = rideToBody(defaultPolice);
    expect(slow.ticksAfterTheBody).toBeGreaterThan(TICK_RATE);
    expect(slow.fastest).toBeGreaterThan(8);
    expect(slow.fastest).toBeLessThan(11);
    expect(quick.fastest).toBeGreaterThan(slow.fastest + 3);
  });

  it("a cop in pursuit rides no faster than the setup allows", () => {
    const slow = chase({ ...defaultPolice, topSpeed: 46 }, 15, 70);
    const quick = chase({ ...defaultPolice, topSpeed: 54 }, 15, 70);
    expect(slow.fastest).toBeGreaterThan(44);
    expect(slow.fastest).toBeLessThan(48);
    expect(quick.fastest).toBeGreaterThan(52);
    expect(quick.fastest).toBeLessThan(56);
  });
});
