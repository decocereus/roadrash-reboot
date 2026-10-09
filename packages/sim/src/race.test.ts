import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { pilotInput } from "./pilot.ts";
import { BUST_FINE } from "./police.ts";
import { createRace, standings, stepRace } from "./race.ts";
import { MAX_STAMINA, TICK_RATE } from "./state.ts";
import type { RaceEvent, RaceState, RiderInput } from "./state.ts";

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

const crashNearCop = (copS: number) => {
  const state = createRace(straight, 1, 0, 1);
  const me = riderAt(state, 0);
  const cop = riderAt(state, 1);
  me.s = 200;
  me.speed = 15;
  me.stamina = 0;
  cop.s = copS;
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

const column = (riderCount: number) => {
  const state = createRace(straight, 1, riderCount - 1, 0);
  for (const rider of state.riders) {
    rider.s = 100;
    rider.x = 0;
    rider.speed = 30;
  }
  return state;
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
    const state = column(3);
    const rear = riderAt(state, 0);
    rear.speed = 45;
    riderAt(state, 1).s = 101.8;
    riderAt(state, 1).x = -0.3;
    const stopped = riderAt(state, 2);
    stopped.s = 102.5;
    stopped.x = 0.3;
    stopped.speed = 0;
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
