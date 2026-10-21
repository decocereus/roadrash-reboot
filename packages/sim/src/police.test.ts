import { describe, expect, it } from "vitest";

import { pilotInput } from "./pilot.ts";
import { chaserDistance, PATROL_SPEED } from "./police.ts";
import {
  cruising,
  field,
  patrolFrom,
  player,
  riderAt,
  straight,
  towardTheBike,
  track,
} from "./race-fixtures.ts";
import {
  createRace,
  defaultPolice,
  defaultSetup,
  standings,
  stepRace,
} from "./race.ts";
import { MAX_STAMINA, TICK_RATE } from "./state.ts";
import type { PoliceSetup, RaceEvent, RiderInput } from "./state.ts";
import { arm } from "./weapons.ts";

describe("meeting the police", () => {
  it("a cop parked on the verge pulls out after the pack before the player has ridden two kilometres", () => {
    const state = createRace(defaultSetup(track, 4));
    const cop = riderAt(state, 6);
    expect({
      offRoad: Math.abs(cop.x) > track.roadHalfWidth,
      s: cop.s,
      speed: cop.speed,
    }).toStrictEqual({ offRoad: true, s: 1500, speed: 0 });
    const inputs = state.riders.map(() => ({ ...cruising }));
    let pursuedAt = Number.POSITIVE_INFINITY;
    let fastestWhileParked = 0;
    while (
      player(state).s < 2000 &&
      player(state).mode === "riding" &&
      state.tick < 120 * TICK_RATE
    ) {
      for (const [index, input] of inputs.entries()) {
        pilotInput(state, track, index, input);
      }
      stepRace(state, track, inputs);
      if (state.events.some((event) => event.kind === "pursuit")) {
        pursuedAt = Math.min(pursuedAt, player(state).s);
      }
      if (pursuedAt === Number.POSITIVE_INFINITY) {
        fastestWhileParked = Math.max(fastestWhileParked, cop.speed);
      }
    }
    expect(pursuedAt).toBeLessThan(2000);
    expect({
      fastestWhileParked,
      onRoad: Math.abs(cop.x) < track.roadHalfWidth,
    }).toStrictEqual({ fastestWhileParked: 0, onRoad: true });
  });
});

const crashNearCop = (
  copS: number,
  police: PoliceSetup = defaultPolice,
  seconds = 15
) => {
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
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [towardTheBike(me, flatOut), copInput]);
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

  it("a rider who remounts before the cop arrives is not busted, and the cop gives chase instead", () => {
    const { cop, events, me } = crashNearCop(60, defaultPolice, 9);
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
    stepRace(state, straight, [towardTheBike(me, flatOut), copInput]);
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
    me.speed = 30;
    me.x = -1.8;
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

  it("a cop beside a rider who is knocked off at 160 km/h brakes, is passed by the flying body, and arrests it within a second and a half", () => {
    const { mode, ticksToArrest } = knockedOffBeside(45);
    expect(mode).toBe("busted");
    expect(ticksToArrest).toBeGreaterThanOrEqual(30);
    expect(ticksToArrest).toBeLessThan(1.5 * TICK_RATE);
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
    if (cop.chase === 0 && me.mode !== "riding") {
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
    const slow = chase({ ...defaultPolice, topSpeed: 40 }, 15, 70);
    const quick = chase({ ...defaultPolice, topSpeed: 48 }, 15, 70);
    expect(slow.fastest).toBeGreaterThan(38);
    expect(slow.fastest).toBeLessThan(42);
    expect(quick.fastest).toBeGreaterThan(46);
    expect(quick.fastest).toBeLessThan(50);
  });
});
