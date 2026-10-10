import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { pilotInput } from "./pilot.ts";
import { BUST_FINE, PATROL_SPEED } from "./police.ts";
import { createRace, standings, stepRace } from "./race.ts";
import { MAX_STAMINA, TICK_RATE } from "./state.ts";
import type { RaceEvent, RaceState, RiderInput } from "./state.ts";
import { arm, disarm } from "./weapons.ts";

const track = compileTrack(ridgeRoad);
const quietTrack = compileTrack({ ...ridgeRoad, trafficPerKilometre: 0 });
const straight = compileTrack({
  ...ridgeRoad,
  sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
  trafficPerKilometre: 0,
});

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
  const state = createRace(quietTrack, 1, 0, 0);
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
  const state = createRace(quietTrack, 1, 0, 0);
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
    const state = createRace(quietTrack, 1, 0, 0);
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
    const sprint = createRace(flat, 1, 0, 0);
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
    const state = createRace(flat, 1, 0, 0);
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
    const state = createRace(quietTrack, 1, 0, 0);
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
    const state = createRace(quietTrack, 1, 0, 0);
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
    const state = createRace(flat, 1, 0, 0);
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
    const flatOut = createRace(quietTrack, 1, 0, 0);
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

    const sane = createRace(quietTrack, 1, 0, 0);
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
    const state = createRace(quietTrack, 1, 0, 0);
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
    const state = createRace(quietTrack, 1, 0, 0);
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
    const state = createRace(track, 7, 0, 0);
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
    const state = createRace(quietTrack, 1, 0, 0);
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
    const state = createRace(straight, 1, 0, 0);
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
    const state = createRace(quietTrack, 1, 0, 0);
    const events = pilotUntilFinish(state, quietTrack, 240);
    const rider = player(state);
    expect(rider.finishTick).toBeGreaterThan(0);
    expect(rider.crashes).toBe(0);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    const seconds = rider.finishTick / TICK_RATE;
    expect(seconds).toBeGreaterThan(80);
    expect(seconds).toBeLessThan(130);
  });

  it("the pilot gets through traffic and still finishes", () => {
    const state = createRace(track, 11, 0, 0);
    pilotUntilFinish(state, track, 400);
    expect(player(state).finishTick).toBeGreaterThan(0);
  });

  it("replays identically from the same seed and inputs", () => {
    const first = createRace(track, 3, 0, 0);
    const second = createRace(track, 3, 0, 0);
    pilotUntilFinish(first, track, 60);
    pilotUntilFinish(second, track, 60);
    expect(second).toStrictEqual(first);
  });
});

describe("the pack", () => {
  it("a punch drains stamina and enough of them knock the rival down", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = createRace(flat, 1, 1, 0);
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

  it("six riders all finish Ridge Road with a cop on patrol and the standings are ordered", () => {
    const state = createRace(track, 4);
    const racers = state.riders.filter(
      (rider) => rider.profile.role === "racer"
    );
    expect(state.riders).toHaveLength(7);
    const inputs = state.riders.map(() => ({
      brake: 0,
      kick: false,
      punch: false,
      steer: 0,
      throttle: 0,
    }));
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 300 * TICK_RATE; tick += 1) {
      for (const [index, input] of inputs.entries()) {
        pilotInput(state, track, index, input);
      }
      stepRace(state, track, inputs);
      events.push(...state.events);
      if (racers.every((rider) => rider.finishTick >= 0)) {
        break;
      }
    }
    expect(events.some((event) => event.kind === "pursuit")).toBeTruthy();
    expect(racers.every((rider) => rider.finishTick >= 0)).toBeTruthy();
    const order = standings(state);
    expect(order).toHaveLength(6);
    for (let place = 1; place < order.length; place += 1) {
      const ahead = state.riders[order[place - 1] ?? 0];
      const behind = state.riders[order[place] ?? 0];
      expect(
        (ahead?.finishTick ?? 0) <= (behind?.finishTick ?? 0)
      ).toBeTruthy();
    }
  });
});

const sideBySide = () => {
  const state = createRace(straight, 1, 2, 0);
  riderAt(state, 1).s = 900;
  const me = riderAt(state, 0);
  const bruiser = riderAt(state, 2);
  for (const rider of [me, bruiser]) {
    rider.s = 50;
    rider.speed = 30;
  }
  return { bruiser, me, state };
};

const brawl = (
  state: RaceState,
  seconds: number,
  inputsAt: (tick: number) => readonly RiderInput[]
): RaceEvent[] => {
  const me = riderAt(state, 0);
  const bruiser = riderAt(state, 2);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    me.x = 0.3;
    bruiser.x = 1.8;
    bruiser.s = me.s;
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
    const state = createRace(quietTrack, 1, 1, 0);
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
    const fist = MAX_STAMINA - punched.bruiser.stamina;
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
    const { bruiser, me, state } = sideBySide();
    expect(bruiser.weapon).toBe("club");
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
    expect(bruiser.weapon).toBe("none");
    expect(events.at(-1)).toMatchObject({ attack: "punch", weapon: "none" });
  });

  it("a kick that lands on an armed rival takes the weapon", () => {
    const { bruiser, me, state } = sideBySide();
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
    expect([me.weapon, bruiser.weapon]).toStrictEqual(["club", "none"]);
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
    const state = createRace(track, 4);
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

const crashNearCop = (copS: number) => {
  const state = createRace(straight, 1, 0, 1);
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
    expect(events).toContainEqual({
      cop: 1,
      fine: BUST_FINE,
      kind: "busted",
      rider: 0,
    });
    expect(events.map((event) => event.kind)).not.toContain("remount");
    expect({
      mode: me.mode,
      pulledOver: Math.abs(me.bodyX) > straight.roadHalfWidth,
    }).toStrictEqual({ mode: "busted", pulledOver: true });
    expect(standings(state)).toStrictEqual([0]);
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

const parked: RiderInput = { ...cruising, brake: 1, throttle: 0 };

describe("the end of a patrol", () => {
  it("a cop that reaches the end of the track pulls off the road and the traffic behind it drives on", () => {
    const state = createRace(track, 7, 0, 1);
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
  const state = createRace(straight, 1, riderCount - 1, 0);
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
    const { bruiser, me, state } = sideBySide();
    bruiser.weapon = "none";
    bruiser.weaponHits = 0;
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
    expect(me.stamina).toBe(bruiser.stamina);
    expect(me.stamina).toBeLessThan(MAX_STAMINA);
  });

  it("two riders who punch each other on the same tick are stunned for the same time", () => {
    const { bruiser, me, state } = sideBySide();
    disarm(bruiser);
    const stuns: number[][] = [];
    brawl(state, 0.5, (tick) => {
      stuns.push([me.hitStun, bruiser.hitStun]);
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
  const state = createRace(straight, 1, 1, 0);
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
    const state = createRace(straight, 1, 1, 0);
    const viper = riderAt(state, 1);
    const rival = { ...viper, profile: { ...viper.profile, aggression: 1 } };
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
    const alone = createRace(track, 5);
    pilotPack([alone], 40);
    const again = createRace(track, 5);
    pilotPack([again], 40);
    const beside = createRace(track, 5);
    const other = createRace(track, 9);
    pilotPack([beside, other], 40);
    expect(JSON.stringify(again)).toBe(JSON.stringify(alone));
    expect(JSON.stringify(beside)).toBe(JSON.stringify(alone));
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(alone));
  });
});
